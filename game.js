"use strict";

class InputHandler {
  constructor(game) {
    this.game = game;
    this.keys = new Set();
    this.fireHeld = false;
    this.lastJump = false;
    this.bindEvents();
  }

  bindEvents() {
    window.addEventListener("keydown", (event) => {
      const key = event.key.toLowerCase();
      if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) event.preventDefault();
      if (!this.keys.has(key)) {
        if (key === "arrowup" && this.game.player.jetpackTimer <= 0) this.game.player.jump();
        if (key === "arrowdown" && this.game.player.jetpackTimer <= 0) this.game.player.pressDown();
        if (key === "z") this.game.toggleWeapon();
        if (key === "control" || key === "escape" || key === "p") this.game.togglePause();
      }
      this.keys.add(key);
      if (key === " " || key === "j" || key === "x" || key === "enter") this.fireHeld = true;
    });
    window.addEventListener("keyup", (event) => {
      const key = event.key.toLowerCase();
      this.keys.delete(key);
      if (key === "arrowdown" && this.game.player.jetpackTimer <= 0) this.game.player.releaseCrouch();
      if (key === " " || key === "j" || key === "x" || key === "enter") this.fireHeld = false;
    });
    window.addEventListener("blur", () => {
      this.keys.clear();
      this.fireHeld = false;
      this.game.player.releaseCrouch();
    });
    document.querySelectorAll("[data-action]").forEach((button) => {
      const action = button.dataset.action;
      const press = (event) => {
        event.preventDefault();
        if (action === "up" || action === "jump") {
          if (this.game.player.jetpackTimer > 0) this.keys.add("arrowup");
          else this.game.player.jump();
        }
        if (action === "down" || action === "drop") {
          if (this.game.player.jetpackTimer > 0) this.keys.add("arrowdown");
          else this.game.player.pressDown();
        }
        if (action === "left") this.keys.add("arrowleft");
        if (action === "right") this.keys.add("arrowright");
        if (action === "weapon") this.game.toggleWeapon();
        if (action === "fire") this.fireHeld = true;
        if (action === "pause") this.game.togglePause();
      };
      const release = (event) => {
        event.preventDefault();
        if (action === "up" || action === "jump") this.keys.delete("arrowup");
        if (action === "down" || action === "drop") {
          this.keys.delete("arrowdown");
          if (this.game.player.jetpackTimer <= 0) this.game.player.releaseCrouch();
        }
        if (action === "left") this.keys.delete("arrowleft");
        if (action === "right") this.keys.delete("arrowright");
        if (action === "fire") this.fireHeld = false;
      };
      button.addEventListener("pointerdown", press);
      button.addEventListener("pointerup", release);
      button.addEventListener("pointercancel", release);
      button.addEventListener("pointerleave", release);
      button.addEventListener("contextmenu", (event) => event.preventDefault());
    });
  }
}

class Player {
  constructor(game) {
    this.game = game;
    this.width = 45;
    this.standingHeight = 63;
    this.crouchingHeight = 38;
    this.height = this.standingHeight;
    this.crouching = false;
    this.x = 125;
    this.y = 0;
    this.velocityY = 0;
    this.grounded = true;
    this.health = 3;
    this.maxHealth = 4;
    this.invulnerable = 0;
    this.shieldTimer = 0;
    this.dashActive = false;
    this.dashTargetX = 0;
    this.dashInvulnerability = 0;
    this.jetpackTimer = 0;
    this.runTime = 0;
    this.fireCooldown = 0;
    this.autoAimCooldown = 0;
    this.autoAimActive = false;
    this.jumpBuffer = 0;
    this.jumpsUsed = 0;
  }

  get floor() { return this.game.height * 0.78; }

  jump() {
    if (this.game.state !== "running") return;
    this.jumpBuffer = 0.13;
  }

  isOnGround() {
    return this.grounded && Math.abs(this.y + this.height - this.floor) <= 6;
  }

  pressDown() {
    if (this.game.state !== "running" || !this.grounded) return;
    if (this.isOnGround()) {
      this.setCrouching(true);
      return;
    }
    this.dropThroughPlatform();
  }

  releaseCrouch() {
    this.setCrouching(false);
  }

  setCrouching(crouching) {
    if (crouching === this.crouching) return;
    const bottom = this.y + this.height;
    this.crouching = crouching;
    this.height = crouching ? this.crouchingHeight : this.standingHeight;
    this.y = bottom - this.height;
  }

  dropThroughPlatform() {
    if (this.game.state !== "running" || !this.grounded) return;
    const bottom = this.y + this.height;
    const platform = this.game.platforms.find((candidate) =>
      this.x + this.width - 8 > candidate.x &&
      this.x + 8 < candidate.x + candidate.width &&
      Math.abs(bottom - candidate.y) <= 6);
    if (!platform) return;
    this.dropThrough = platform;
    this.velocityY = 95;
    this.grounded = false;
  }

  update(dt) {
    this.shieldTimer = Math.max(0, this.shieldTimer - dt);
    this.jetpackTimer = Math.max(0, this.jetpackTimer - dt);
    this.dashInvulnerability = Math.max(0, this.dashInvulnerability - dt);
    const movingRight = this.game.input.keys.has("arrowright");
    const movingLeft = this.game.input.keys.has("arrowleft");
    const horizontalDirection = Number(movingRight) - Number(movingLeft);
    if (this.dashActive) {
      const previousX = this.x;
      this.x = Math.min(this.dashTargetX, this.x + 1020 * dt);
      this.runTime += dt * 30;
      this.damageEnemiesDuringDash(previousX, this.x);
      if (this.x >= this.dashTargetX) {
        this.dashActive = false;
        this.dashInvulnerability = 0.12;
      }
    } else {
      const horizontalSpeed = horizontalDirection < 0 ? 280 : 340;
      this.x += horizontalDirection * horizontalSpeed * dt;
      this.runTime += dt * (horizontalDirection === 0 ? 12 : 17);
    }
    this.x = Math.max(8, Math.min(this.game.width - this.width - 8, this.x));
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    this.autoAimCooldown = Math.max(0, this.autoAimCooldown - dt);
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    if (this.jetpackTimer > 0) {
      this.setCrouching(false);
      this.velocityY = 0;
      this.y += (Number(this.game.input.keys.has("arrowdown")) -
        Number(this.game.input.keys.has("arrowup"))) * 310 * dt;
      this.y = Math.max(20, Math.min(this.floor - this.height, this.y));
      this.grounded = this.y + this.height >= this.floor;
      this.jumpBuffer = 0;
    } else {
      if (this.jumpBuffer > 0 && (this.grounded || this.jumpsUsed < 2)) {
        const isDoubleJump = !this.grounded;
        this.setCrouching(false);
        this.velocityY = -700;
        this.grounded = false;
        this.jumpsUsed++;
        this.jumpBuffer = 0;
        this.game.audio.play("jump");
        this.game.addBurst(
          this.x + 22,
          this.y + this.height,
          isDoubleJump ? "#73eaff" : "#d4ff48",
          isDoubleJump ? 11 : 7,
          isDoubleJump ? 145 : 115
        );
      }
      const previousBottom = this.y + this.height;
      this.velocityY += 1550 * dt;
      this.y += this.velocityY * dt;
      let stompedEnemy = false;
      if (this.velocityY > 0) {
        for (const enemy of this.game.enemies) {
          const overlapsEnemy = this.x + this.width - 8 > enemy.x &&
            this.x + 8 < enemy.x + enemy.width;
          if (!enemy.dead && overlapsEnemy && previousBottom <= enemy.y + 8 &&
              this.y + this.height >= enemy.y) {
            enemy.damage(enemy.hp);
            this.y = enemy.y - this.height;
            this.velocityY = -330;
            this.grounded = false;
            this.jumpBuffer = 0;
            stompedEnemy = true;
            break;
          }
        }
      }
      const caveHole = this.dashActive
        ? null
        : this.game.getCaveHoleUnder(this.x + this.width / 2);
      let landingSurface = caveHole ? Infinity : this.floor;
      if (!stompedEnemy && this.velocityY >= 0) {
        for (const platform of this.game.platforms) {
          if (platform === this.dropThrough) continue;
          const overlapsPlatform = this.x + this.width - 8 > platform.x &&
            this.x + 8 < platform.x + platform.width;
          if (overlapsPlatform && previousBottom <= platform.y + 5 &&
              this.y + this.height >= platform.y && platform.y < landingSurface) {
            landingSurface = platform.y;
          }
        }
        if (this.dropThrough &&
            (this.dropThrough.dead || this.y > this.dropThrough.y + this.dropThrough.height)) {
          this.dropThrough = null;
        }
      }
      if (this.y + this.height >= landingSurface) {
        this.y = landingSurface - this.height;
        this.velocityY = 0;
        this.grounded = true;
        this.jumpsUsed = 0;
      } else {
        this.grounded = false;
      }
      if (caveHole && this.y + this.height >= this.floor + 12) {
        this.game.playerFallsIntoCaveHole(this, caveHole);
      }
    }
    if (this.game.input.fireHeld && this.fireCooldown <= 0) this.shoot();
    if (this.autoAimActive && this.autoAimCooldown <= 0) this.fireAutoAimWeapon();
  }

  damageEnemiesDuringDash(previousX, currentX) {
    const sweepRight = currentX + this.width;
    for (const enemy of this.game.enemies) {
      if (enemy.dead || enemy.x >= sweepRight || enemy.x + enemy.width <= previousX) continue;
      if (this.y < enemy.y + enemy.height && this.y + this.height > enemy.y) {
        enemy.damage(enemy.hp);
      }
    }
  }

  startDash() {
    this.setCrouching(false);
    this.dashTargetX = Math.max(8, this.game.width - this.width - 100);
    this.dashActive = this.x < this.dashTargetX;
    this.dashInvulnerability = this.dashActive ? 0 : 0.12;
    this.game.showPickupMessage("ALIEN BREAKER DASH · 3X SPEED · INVULNERABLE");
    if (!this.dashActive) {
      this.game.addBurst(this.x + this.width / 2, this.y + this.height / 2, "#ffb14a", 18, 180);
    }
  }

  shoot() {
    const muzzleX = this.x + this.width - 1;
    const muzzleY = this.y + 26;
    const weapon = this.game.weapon;
    if (this.game.isAmmoWeapon(weapon) &&
        this.game.weaponAmmo[weapon] <= 0) {
      this.game.expireWeapon(weapon);
      return;
    }
    if (weapon === "spread" || weapon === "rapid-spread") {
      const velocity = weapon === "rapid-spread" ? 700 : 650;
      for (const degrees of [0, -22.5, -45]) {
        const angle = degrees * Math.PI / 180;
        this.game.projectiles.push(new Projectile(this.game, muzzleX, muzzleY, {
          weapon, vx: Math.cos(angle) * velocity, vy: Math.sin(angle) * velocity, damage: 1
        }));
      }
    } else {
      this.game.projectiles.push(new Projectile(this.game, muzzleX, muzzleY, { weapon }));
    }
    this.fireCooldown = { single: 0.38, rapid: 0.145, spread: 0.32, "rapid-spread": 0.16, grenade: 0.72 }[weapon];
    this.game.audio.play("shoot");
    const color = {
      single: "#d4ff48", rapid: "#78f6ff", spread: "#ffbd62",
      "rapid-spread": "#b58cff", grenade: "#ff834f"
    }[weapon];
    this.game.addBurst(muzzleX + 5, muzzleY, color, weapon === "spread" || weapon === "rapid-spread" ? 5 : 3, 48);
    this.game.consumeWeaponAmmo(weapon);
  }

  fireAutoAimWeapon() {
    const target = this.game.enemies
      .filter((enemy) => !enemy.dead && enemy.x + enemy.width >= this.x)
      .reduce((nearest, enemy) => {
        if (!nearest) return enemy;
        const distance = Math.hypot(
          enemy.x + enemy.width / 2 - (this.x + this.width),
          enemy.y + enemy.height / 2 - (this.y + this.height / 2)
        );
        const nearestDistance = Math.hypot(
          nearest.x + nearest.width / 2 - (this.x + this.width),
          nearest.y + nearest.height / 2 - (this.y + this.height / 2)
        );
        return distance < nearestDistance ? enemy : nearest;
      }, null);
    if (!target) return;

    const muzzleX = this.x + this.width - 1;
    const muzzleY = this.y + this.height * 0.42;
    const angle = Math.atan2(
      target.y + target.height / 2 - muzzleY,
      target.x + target.width / 2 - muzzleX
    );
    const speed = 720;
    this.game.projectiles.push(new Projectile(this.game, muzzleX, muzzleY, {
      weapon: "auto-aim",
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      damage: 1
    }));
    this.autoAimCooldown = 0.145;
    this.game.audio.play("shoot");
  }

  hit() {
    if (this.invulnerable > 0 || this.shieldTimer > 0 || this.dashActive ||
        this.dashInvulnerability > 0 || this.game.state !== "running") return;
    this.invulnerable = 1.55;
    this.game.audio.play("hit");
    if (this.autoAimActive) {
      this.autoAimActive = false;
      this.game.shake = 7;
      this.game.addBurst(this.x + 20, this.y + 30, "#b58cff", 18, 220);
      this.game.showPickupMessage("AUTO-AIM DRONE LOST · HULL PROTECTED");
      return;
    }
    this.health--;
    this.game.updateHealth();
    this.game.shake = 10;
    this.game.addBurst(this.x + 20, this.y + 30, "#ff644f", 20, 250);
    if (this.health <= 0) this.game.end();
  }

  draw(ctx) {
    if (this.invulnerable > 0 && Math.floor(this.invulnerable * 13) % 2 === 0) return;
    const stride = Math.sin(this.runTime);
    const cx = this.x + this.width / 2;
    const ground = this.y + this.height;
    ctx.save();
    ctx.translate(cx, this.y + this.height);
    ctx.scale(1, this.height / this.standingHeight);
    ctx.translate(0, -this.standingHeight);
    ctx.shadowColor = "#d4ff48";
    ctx.shadowBlur = 13;
    ctx.fillStyle = "#d4ff48";
    ctx.beginPath();
    ctx.moveTo(-10, 22); ctx.lineTo(-18, 28); ctx.lineTo(-17, 43);
    ctx.lineTo(-10, 40); ctx.lineTo(-8, 54); ctx.lineTo(-15 + stride * 6, 62);
    ctx.lineTo(-4 + stride * 6, 62); ctx.lineTo(2, 49);
    ctx.lineTo(7, 60); ctx.lineTo(18 - stride * 6, 62);
    ctx.lineTo(16 - stride * 6, 55); ctx.lineTo(13, 41);
    ctx.lineTo(17, 34); ctx.lineTo(13, 25); ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#f4f0e8";
    ctx.beginPath();
    ctx.moveTo(-12, 8); ctx.lineTo(0, 4); ctx.lineTo(11, 9);
    ctx.lineTo(14, 25); ctx.lineTo(7, 33); ctx.lineTo(-13, 28); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#c3f7ff";
    ctx.beginPath(); ctx.ellipse(2, 1, 9, 11, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#324a61";
    ctx.beginPath(); ctx.ellipse(5, 1, 5, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#ff644f";
    ctx.fillRect(-9, 37, 5, 8);
    ctx.fillStyle = "#d4ff48";
    ctx.fillRect(9, 27, 17, 4);
    ctx.fillStyle = "#f3f3ed";
    ctx.fillRect(16, 27, 8, 4);
    ctx.fillStyle = "#ff8357";
    ctx.fillRect(22 + Math.random() * 3, 28, 6, 2);
    ctx.restore();
    if (this.autoAimActive) {
      const droneX = this.x - 12;
      const droneY = this.y + 21 + Math.sin(this.game.elapsed * 7) * 3;
      ctx.save();
      ctx.shadowColor = "#b58cff";
      ctx.shadowBlur = 14;
      ctx.fillStyle = "#b58cff";
      ctx.beginPath();
      ctx.arc(droneX, droneY, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#f3eaff";
      ctx.fillRect(droneX - 1, droneY - 1, 2, 2);
      ctx.restore();
    }
    if (this.jetpackTimer > 0) {
      ctx.save();
      ctx.shadowColor = "#73eaff";
      ctx.shadowBlur = 13;
      ctx.fillStyle = "#73eaff";
      const flameX = this.x + 8;
      const flameY = this.y + this.height - 2;
      ctx.beginPath();
      ctx.moveTo(flameX, flameY);
      ctx.lineTo(flameX + 9, flameY + 15 + Math.random() * 7);
      ctx.lineTo(flameX + 17, flameY);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    const shieldWarningBlink = this.shieldTimer <= 2 &&
      Math.floor((2 - this.shieldTimer) * 8) % 2 === 0;
    if (this.shieldTimer > 0 && !shieldWarningBlink) {
      ctx.save();
      ctx.globalAlpha = 0.45 + Math.sin(this.game.elapsed * 10) * 0.12;
      ctx.strokeStyle = "#73eaff";
      ctx.lineWidth = 2;
      ctx.shadowColor = "#73eaff";
      ctx.shadowBlur = 13;
      ctx.beginPath();
      ctx.ellipse(cx, this.y + this.height / 2, this.width * .82, this.height * .76,
        0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }
}

class Projectile {
  constructor(game, x, y, options = {}) {
    this.game = game;
    this.x = x;
    this.y = y;
    this.weapon = options.weapon || "single";
    this.grenade = this.weapon === "grenade";
    this.radius = this.grenade ? 9 : this.weapon === "rapid" || this.weapon === "rapid-spread" || this.weapon === "auto-aim" ? 4 : 6;
    this.speed = this.weapon === "rapid" || this.weapon === "rapid-spread" || this.weapon === "auto-aim" ? 720 : 610;
    this.damage = options.damage || (this.weapon === "rapid" ? 1 : 2);
    this.vx = options.vx || (this.grenade ? 480 : this.speed);
    this.vy = options.vy || (this.grenade ? -210 : 0);
    this.dead = false;
  }

  update(dt) {
    const previousY = this.y;
    this.x += this.vx * dt;
    if (this.grenade) {
      this.vy += 720 * dt;
      this.y += this.vy * dt;
    } else {
      this.y += this.vy * dt;
    }
    if (this.x > this.game.width + 20 || this.y < -20) {
      if (this.grenade) this.explode();
      else this.dead = true;
      return;
    }
    for (const hazard of this.game.caveHazards) {
      if (hazard.type !== "falling-spike" || hazard.dead) continue;
      if (this.x + this.radius > hazard.x && this.x - this.radius < hazard.x + hazard.width &&
          this.y + this.radius > hazard.y && this.y - this.radius < hazard.y + hazard.height) {
        hazard.dead = true;
        this.dead = true;
        this.game.addBurst(hazard.x + hazard.width / 2, hazard.y + hazard.height / 2, "#d8c7a6", 12, 160);
        if (this.grenade) this.game.detonate(this.x, this.y);
        return;
      }
    }
    for (const enemy of this.game.enemies) {
      if (enemy.dead) continue;
      if (this.x + this.radius > enemy.x && this.x - this.radius < enemy.x + enemy.width &&
          this.y + this.radius > enemy.y && this.y - this.radius < enemy.y + enemy.height) {
        if (this.grenade) {
          this.explode();
          return;
        }
        enemy.damage(this.damage);
        this.dead = true;
        const color = this.weapon === "spread" ? "#ffbd62" :
          this.weapon === "rapid-spread" ? "#b58cff" :
          this.weapon === "rapid" || this.weapon === "auto-aim" ? "#78f6ff" :
          this.weapon === "rapid-spread" ? "#b58cff" : "#d4ff48";
        this.game.addBurst(this.x, this.y, color, 5, 95);
        break;
      }
    }
    if (!this.grenade || this.dead) return;
    const floor = this.game.player.floor;
    const hitFloor = this.y + this.radius >= floor && this.vy > 0;
    const hitPlatform = this.vy > 0 && this.game.platforms.some((platform) =>
      this.x >= platform.x && this.x <= platform.x + platform.width &&
      previousY + this.radius <= platform.y && this.y + this.radius >= platform.y);
    if (hitFloor || hitPlatform) this.explode();
  }

  explode() {
    if (this.dead) return;
    this.dead = true;
    this.game.detonate(this.x, this.y);
  }

  draw(ctx) {
    ctx.save();
    if (this.grenade) {
      ctx.shadowColor = "#ff834f"; ctx.shadowBlur = 15; ctx.fillStyle = "#ff834f";
      ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0; ctx.fillStyle = "#ffe2a1";
      ctx.beginPath(); ctx.arc(this.x - 3, this.y - 3, 3, 0, Math.PI * 2); ctx.fill();
    } else {
      const color = this.weapon === "spread" ? "#ffbd62" :
        this.weapon === "rapid-spread" ? "#b58cff" :
        this.weapon === "rapid" || this.weapon === "auto-aim" ? "#78f6ff" :
        this.weapon === "rapid-spread" ? "#b58cff" : "#ecff9a";
      ctx.shadowColor = color;
      ctx.shadowBlur = 17;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(this.x, this.y, this.radius * 1.8, this.radius * 0.75, Math.atan2(this.vy, this.vx), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

class Pickup {
  constructor(game, type, x, milestone, platform = null) {
    this.game = game;
    this.type = type;
    this.x = x;
    this.milestone = milestone;
    this.platform = platform;
    this.platformOffset = platform ? x - platform.x : 0;
    this.size = type === "health" || type === "double-health" ? 17 : 19;
    this.baseY = platform ? platform.y - this.size - 6 : game.player.floor - 39;
    this.y = this.baseY;
    this.phase = Math.random() * Math.PI * 2;
    this.dead = false;
  }

  update(dt) {
    if (this.platform) {
      if (this.platform.dead) {
        this.dead = true;
        return;
      }
      this.x = this.platform.x + this.platformOffset;
      this.baseY = this.platform.y - this.size - 6;
    } else {
      this.x -= this.game.speed * 0.76 * dt;
    }
    this.y = this.baseY + Math.sin(this.game.elapsed * 4 + this.phase) * 4;
    if (this.x + this.size < -10) {
      this.dead = true;
      return;
    }
    const player = this.game.player;
    if (this.x + this.size > player.x + 5 && this.x < player.x + player.width - 5 &&
        this.y + this.size > player.y + 8 && this.y < player.y + player.height - 5) {
      this.collect();
    }
  }

  collect() {
    if (this.dead) return;
    this.dead = true;
    if (this.type === "health" || this.type === "double-health") {
      const restored = this.type === "double-health" ? 2 : 1;
      const player = this.game.player;
      player.maxHealth = Math.min(this.game.healthCap, player.maxHealth + restored);
      player.health = Math.min(player.maxHealth, player.health + restored);
      this.game.updateHealth();
      this.game.showPickupMessage(
        this.game.player.health === this.game.player.maxHealth
          ? "HULL RESTORED · FULL INTEGRITY"
          : `HULL REPAIRED · +${restored}`
      );
      this.game.addBurst(this.x + this.size / 2, this.y + this.size / 2, "#78f6ff", 18, 155);
    } else if (this.type === "auto-aim") {
      this.game.player.autoAimActive = true;
      this.game.player.autoAimCooldown = 0;
      this.game.showPickupMessage("AUTO-AIM DRONE ONLINE · RAPID FIRE · NEXT HIT ABSORBED");
      this.game.addBurst(this.x + this.size / 2, this.y + this.size / 2, "#b58cff", 18, 155);
    } else if (this.type === "shield") {
      this.game.player.shieldTimer = 10;
      this.game.showPickupMessage("SHIELD BUBBLE ACTIVE · 10 SECONDS INVULNERABLE");
      this.game.addBurst(this.x + this.size / 2, this.y + this.size / 2, "#73eaff", 18, 155);
    } else if (this.type === "dash") {
      this.game.player.startDash();
      this.game.addBurst(this.x + this.size / 2, this.y + this.size / 2, "#ffb14a", 18, 155);
    } else if (this.type === "jetpack") {
      const player = this.game.player;
      player.jetpackTimer = 30;
      player.setCrouching(false);
      player.velocityY = 0;
      this.game.showPickupMessage("JETPACK ONLINE · ARROW KEYS · 30 SECONDS");
      this.game.addBurst(this.x + this.size / 2, this.y + this.size / 2, "#58dfff", 18, 155);
    } else {
      this.game.unlockedWeapons.add(this.type);
      this.game.weaponAmmo[this.type] += 100;
      this.game.setWeapon(this.type);
      const names = {
        spread: "VECTOR SPREAD · STRAIGHT / UP 22.5° / UP 45°",
        "rapid-spread": "RAPID VECTOR SPREAD · FAST 3-WAY FIRE",
        grenade: "GRENADE LAUNCHER · BLAST RADIUS"
      };
      const name = names[this.type];
      this.game.showPickupMessage(this.milestone
        ? `${this.milestone}M CACHE · ${name} · ${this.game.weaponAmmo[this.type]} SHOTS`
        : `PLATFORM CACHE · ${name} · ${this.game.weaponAmmo[this.type]} SHOTS`);
      const colors = { spread: "#ffbd62", "rapid-spread": "#b58cff", grenade: "#ff834f" };
      this.game.addBurst(this.x + this.size / 2, this.y + this.size / 2, colors[this.type], 18, 155);
    }
    this.game.audio.play("pickup");
  }

  draw(ctx) {
    const centerX = this.x + this.size / 2;
    const centerY = this.y + this.size / 2;
    const color = this.type === "health" || this.type === "double-health" ? "#78f6ff" :
      this.type === "spread" ? "#d4ff48" :
      this.type === "grenade" ? "#ff834f" :
      this.type === "rapid-spread" || this.type === "auto-aim" ? "#b58cff" :
      this.type === "shield" || this.type === "jetpack" ? "#73eaff" :
      this.type === "dash" ? "#ffb14a" : "#ffbd62";
    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(this.game.elapsed * .8);
    ctx.shadowColor = color;
    ctx.shadowBlur = 15;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.strokeRect(-this.size / 2, -this.size / 2, this.size, this.size);
    ctx.rotate(-this.game.elapsed * .8);
    ctx.fillStyle = color;
    if (this.type === "health" || this.type === "double-health") {
      ctx.fillRect(-2, -7, 4, 14);
      ctx.fillRect(-7, -2, 14, 4);
      if (this.type === "double-health") {
        ctx.fillRect(-7, -6, 14, 2);
        ctx.fillRect(-7, 4, 14, 2);
      }
    } else if (this.type === "auto-aim") {
      ctx.beginPath();
      ctx.arc(0, 0, 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, 2, 0, Math.PI * 2);
      ctx.fill();
    } else if (this.type === "shield") {
      ctx.beginPath();
      ctx.arc(0, 0, 7, -.8, Math.PI + .8);
      ctx.stroke();
      ctx.fillRect(-5, 1, 10, 2);
    } else if (this.type === "dash") {
      ctx.beginPath();
      ctx.moveTo(-7, -5); ctx.lineTo(1, -5); ctx.lineTo(-2, -1);
      ctx.lineTo(7, -1); ctx.lineTo(-2, 7); ctx.lineTo(0, 2); ctx.lineTo(-7, 2);
      ctx.closePath(); ctx.fill();
    } else if (this.type === "jetpack") {
      ctx.fillRect(-5, -6, 10, 12);
      ctx.fillRect(-7, -4, 2, 8);
      ctx.fillRect(5, -4, 2, 8);
      ctx.fillRect(-2, 6, 4, 3);
    } else if (this.type === "spread" || this.type === "rapid-spread") {
      for (const angle of [0, -Math.PI / 8, -Math.PI / 4]) {
        ctx.save(); ctx.rotate(angle);
        ctx.beginPath(); ctx.moveTo(-5, -2); ctx.lineTo(5, 0); ctx.lineTo(-5, 2); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    } else {
      ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillRect(-1, -8, 2, 5);
    }
    ctx.restore();
  }
}

class CaveHazard {
  constructor(game, type, x) {
    this.game = game;
    this.type = type;
    this.x = x;
    this.dead = false;
    this.spent = false;
    this.triggered = false;
    this.landed = false;
    this.phase = Math.random() * Math.PI * 2;
    if (type === "hole") {
      this.width = 76 + Math.random() * 42;
      this.height = 0;
      this.y = game.player.floor;
    } else if (type === "ground-spikes") {
      this.width = 35 + Math.random() * 19;
      this.height = 19;
      this.y = game.player.floor - this.height;
    } else {
      this.width = 23 + Math.random() * 12;
      this.height = 38 + Math.random() * 16;
      this.y = -this.height;
      this.velocityY = 0;
      this.fallDelay = 0.35 + Math.random() * 0.9;
    }
  }

  update(dt) {
    this.x -= this.game.speed * 0.76 * dt;
    if (this.type === "hole") this.y = this.game.player.floor;
    if (this.type === "ground-spikes") this.y = this.game.player.floor - this.height;
    if (this.type === "falling-spike" && !this.landed) {
      this.fallDelay -= dt;
      if (this.fallDelay <= 0) {
        this.velocityY += 1050 * dt;
        this.y += this.velocityY * dt;
        if (this.y + this.height >= this.game.player.floor) {
          this.y = this.game.player.floor - this.height;
          this.velocityY = 0;
          this.landed = true;
        }
      }
    }
    if (this.x + this.width < -20) this.dead = true;
  }

  checkPlayerCollision(player) {
    if (this.dead || this.spent || this.type === "hole") return;
    const overlapsX = player.x + player.width - 7 > this.x &&
      player.x + 7 < this.x + this.width;
    const overlapsY = player.y + player.height > this.y + 4 &&
      player.y + 8 < this.y + this.height;
    if (overlapsX && overlapsY) {
      this.spent = true;
      player.hit();
      this.game.addBurst(this.x + this.width / 2, this.y + this.height / 2, "#b8a78b", 9, 130);
    }
  }

  draw(ctx) {
    ctx.save();
    if (this.type === "hole") {
      ctx.fillStyle = "#080b12";
      ctx.fillRect(this.x, this.y - 3, this.width, this.game.height - this.y + 3);
      ctx.fillStyle = "#859568";
      ctx.fillRect(this.x - 3, this.y - 5, this.width + 6, 4);
      ctx.fillStyle = "#262d2b";
      ctx.fillRect(this.x + 6, this.y + 8, Math.max(0, this.width - 12), 4);
    } else {
      ctx.shadowColor = this.spent ? "#00000000" : "#d5b98d";
      ctx.shadowBlur = this.spent ? 0 : 8;
      ctx.fillStyle = this.spent ? "#625b50" : "#b4a58b";
      ctx.beginPath();
      if (this.type === "falling-spike") {
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(this.x + this.width / 2, this.y + this.height);
        ctx.lineTo(this.x + this.width, this.y);
      } else {
        ctx.moveTo(this.x, this.y + this.height);
        ctx.lineTo(this.x + this.width * .18, this.y + 5);
        ctx.lineTo(this.x + this.width * .36, this.y + this.height);
        ctx.lineTo(this.x + this.width * .56, this.y + 2);
        ctx.lineTo(this.x + this.width * .76, this.y + this.height);
        ctx.lineTo(this.x + this.width, this.y + 7);
        ctx.lineTo(this.x + this.width, this.y + this.height);
      }
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
}

class Explosion {
  constructor(x, y, game = null, hostile = false) {
    this.x = x; this.y = y; this.radius = 76;
    this.life = 0.34; this.maxLife = this.life;
    this.game = game;
    this.hostile = hostile;
    this.hasHitPlayer = false;
  }
  update(dt) {
    this.life -= dt;
    if (!this.hostile || this.hasHitPlayer || !this.game) return;
    const progress = 1 - this.life / this.maxLife;
    const activeRadius = this.radius * (0.28 + progress * 0.72);
    const player = this.game.player;
    const nearestX = Math.max(player.x, Math.min(this.x, player.x + player.width));
    const nearestY = Math.max(player.y, Math.min(this.y, player.y + player.height));
    if (Math.hypot(this.x - nearestX, this.y - nearestY) <= activeRadius) {
      this.hasHitPlayer = true;
      player.hit();
    }
  }
  draw(ctx) {
    const progress = 1 - this.life / this.maxLife;
    const radius = this.radius * (0.28 + progress * 0.72);
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - progress);
    const gradient = ctx.createRadialGradient(this.x, this.y, radius * .12, this.x, this.y, radius);
    gradient.addColorStop(0, this.hostile ? "#fff0bc" : "#fff6bf");
    gradient.addColorStop(.35, this.hostile ? "#ff7958" : "#ffbd62");
    gradient.addColorStop(1, this.hostile ? "#ff3c6700" : "#ff644f00");
    ctx.fillStyle = gradient;
    ctx.beginPath(); ctx.arc(this.x, this.y, radius, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

class Platform {
  constructor(game, x, width, elevation, pickupType = null) {
    this.game = game;
    this.x = x;
    this.width = width;
    this.height = 16;
    this.elevation = elevation;
    this.pickupType = pickupType;
    this.trimColor = pickupType === "health" ? "#78f6ff" :
      pickupType === "spread" ? "#d4ff48" :
      pickupType === "rapid-spread" || pickupType === "auto-aim" ? "#b58cff" :
      pickupType === "grenade" ? "#ff834f" : "#a5b0c0";
    this.y = game.height * 0.78 - elevation - this.height;
    this.dead = false;
  }

  update(dt) {
    this.x -= this.game.speed * 0.76 * dt;
    this.y = this.game.height * 0.78 - this.elevation - this.height;
    if (this.x + this.width < -20) this.dead = true;
  }

  draw(ctx) {
    const braceHeight = Math.max(10, this.game.height * 0.78 - this.y - this.height);
    const alienBiome = this.game.distance >= 1000;
    ctx.fillStyle = alienBiome ? "#18252b" : "#161c29";
    ctx.fillRect(this.x + 13, this.y + this.height, 9, braceHeight);
    ctx.fillRect(this.x + this.width - 23, this.y + this.height, 9, braceHeight);
    ctx.fillStyle = alienBiome ? "#344b4c" : "#313b4e";
    ctx.fillRect(this.x, this.y + 5, this.width, this.height - 5);
    ctx.fillStyle = alienBiome ? "#9bc477" : "#818da0";
    ctx.fillRect(this.x, this.y + 2, this.width, 5);
    ctx.fillStyle = this.trimColor;
    ctx.fillRect(this.x + 10, this.y, Math.min(38, this.width - 20), 2);
    ctx.fillStyle = "#5c6879";
    for (let x = this.x + 12; x < this.x + this.width - 8; x += 27) {
      ctx.fillRect(x, this.y + 9, 13, 2);
    }
    ctx.fillStyle = this.pickupType ? this.trimColor : "#ff644f";
    ctx.fillRect(this.x + this.width - 15, this.y + 9, 4, 3);
  }
}

class Enemy {
  constructor(game, type, x, platform = null) {
    this.game = game;
    this.type = type;
    this.x = x;
    this.travelX = x;
    this.platform = platform;
    this.platformOffset = platform ? platform.width * (type === "sentry" ? 0.68 : 0.65) : 0;
    this.baseY = game.height * 0.78;
    this.y = this.baseY - 45;
    this.phase = Math.random() * Math.PI * 2;
    this.speed = game.speed * (type === "charger" ? 1.08 : 0.82);
    this.dead = false;
    this.fireTimer = (1.2 + Math.random() * 1.1) * game.enemyFireRateMultiplier;
    this.weapon = null;
    this.spreadWeaponDecidedTier = 0;
    this.unlockWeapon();
    if (type === "charger") {
      this.width = 49; this.height = 49; this.hp = 2; this.score = 150;
    } else if (type === "sentry") {
      this.width = 43; this.height = 60; this.hp = 3; this.score = 220;
      this.y = this.baseY - this.height;
    } else if (type === "ship") {
      this.width = 70; this.height = 38; this.hp = 4; this.score = 320;
      this.y = game.height * 0.42;
    } else {
      this.width = 54; this.height = 53; this.hp = 3; this.score = 250;
    }
    this.y = this.baseY - this.height;
  }

  unlockWeapon() {
    if (this.type === "sentry" || this.type === "ship") {
      if (this.weapon !== "aimed-bolt" && this.game.canEnemyUseTrackingWeapon(this)) {
        this.weapon = "aimed-bolt";
      }
      return;
    }
    if (this.type === "charger") {
      const tier = this.game.enemySpreadLimit;
      if (!this.game.enemyWeaponUnlocks.has("scatter") ||
          tier <= this.spreadWeaponDecidedTier || this.weapon === "scatter") return;
      if (!this.game.canEnemyUseTrackingWeapon(this)) return;
      this.spreadWeaponDecidedTier = tier;
      if (this.game.enemies.filter((enemy) =>
        !enemy.dead && enemy.type === "charger" && enemy.weapon === "scatter"
      ).length >= tier) return;
      if (Math.random() < 0.5) {
        this.weapon = "scatter";
        this.fireTimer = Math.min(this.fireTimer, 0.9 * this.game.enemyFireRateMultiplier);
      }
      return;
    }
    const weaponByType = { drifter: "arc-mine" };
    const weapon = weaponByType[this.type];
    if (!weapon || !this.game.enemyWeaponUnlocks.has(weapon) || this.weapon === weapon) return;
    if (!this.game.canEnemyUseTrackingWeapon(this)) return;
    this.weapon = weapon;
    this.fireTimer = Math.min(this.fireTimer, 0.9 * this.game.enemyFireRateMultiplier);
  }

  update(dt) {
    if (this.dead) return;
    this.unlockWeapon();
    if (this.platform) {
      if (this.platform.dead) {
        this.dead = true;
        return;
      }
      this.y = this.platform.y - this.height;
      const patrolRange = Math.min(30, this.platform.width * 0.14);
      this.x = this.platform.x + this.platformOffset +
        (this.type === "charger" ? Math.sin(this.game.elapsed * 1.8 + this.phase) * patrolRange : 0);
    } else if (this.type === "sentry") {
      this.x -= this.game.speed * dt * 0.72;
    } else if (this.type === "drifter") {
      this.travelX -= this.speed * dt;
      this.x = this.travelX + Math.sin(this.game.elapsed * 2.3 + this.phase) * 38;
      this.y = this.baseY - this.height - 7 + Math.sin(this.game.elapsed * 2.3 + this.phase) * 25;
    } else if (this.type === "ship") {
      this.x -= this.speed * dt * 0.9;
      this.y = this.game.height * 0.34 + Math.sin(this.game.elapsed * 2.1 + this.phase) * this.game.height * 0.16;
    } else {
      this.x -= this.speed * dt;
    }
    this.fireTimer -= dt;
    if (this.weapon && this.fireTimer <= 0 && this.x < this.game.width - 25 &&
        this.x > this.game.player.x + 105) this.fireWeapon();
    if (this.x < -this.width - 20) this.dead = true;
    if (!this.platform && this.game.isCaveHoleOverlapping(this.x + this.width / 2) &&
        this.y + this.height >= this.game.player.floor - 6) {
      this.game.enemyFallsIntoCaveHole(this);
      return;
    }
    const player = this.game.player;
    if (this.x < player.x + player.width - 7 && this.x + this.width > player.x + 8 &&
        this.y < player.y + player.height - 5 && this.y + this.height > player.y + 10) player.hit();
  }

  fireWeapon() {
    const player = this.game.player;
    const originX = this.x;
    const originY = this.y + this.height * 0.46;
    const canAim = this.game.distance >= 300;
    const targetX = canAim
      ? player.x + player.width * 0.5
      : originX - Math.min(300, this.game.width * 0.42);
    const targetY = canAim
      ? player.y + player.height * 0.48
      : this.game.player.floor - this.game.height * 0.025;
    const aim = canAim ? Math.atan2(targetY - originY, targetX - originX) : Math.PI;
    const fireRateMultiplier = this.game.enemyFireRateMultiplier;
    if (this.weapon === "scatter") {
      this.fireTimer = 2.65 * fireRateMultiplier;
      for (const offset of [-0.24, 0, 0.24]) {
        this.game.enemyProjectiles.push(new EnemyProjectile(
          this.game, originX, originY, "scatter", aim + offset
        ));
      }
    } else if (this.weapon === "arc-mine") {
      this.fireTimer = 3.3 * fireRateMultiplier;
      const flightTime = Math.min(1.5, Math.max(0.65, Math.abs(originX - targetX) / 285));
      const horizontalVelocity = (targetX - originX) / flightTime;
      const gravity = 560;
      const verticalVelocity = (targetY - originY - 0.5 * gravity * flightTime * flightTime) / flightTime;
      this.game.enemyProjectiles.push(new EnemyProjectile(
        this.game, originX, originY, "arc-mine", 0, horizontalVelocity, verticalVelocity
      ));
    } else {
      this.fireTimer = 2.15 * fireRateMultiplier;
      this.game.enemyProjectiles.push(new EnemyProjectile(this.game, originX, originY, "aimed-bolt", aim));
    }
    this.game.addBurst(originX, originY, this.weapon === "arc-mine" ? "#ffad58" : "#ff644f", 4, 65);
  }

  damage(amount) {
    this.hp -= amount;
    if (this.hp <= 0) {
      this.dead = true;
      this.game.score += this.score;
      this.game.audio.play("explode");
      this.game.addBurst(this.x + this.width / 2, this.y + this.height / 2, this.type === "sentry" ? "#ff644f" : "#ffbd62", 17, 190);
    } else {
      this.game.addBurst(this.x + this.width / 2, this.y + this.height / 2, "#fff1b0", 5, 80);
    }
  }

  draw(ctx) {
    const x = this.x, y = this.y;
    ctx.save();
    if (this.type === "ship") {
      this.drawFlyingShip(ctx, x, y);
    } else if (this.game.distance >= 1000) {
      this.drawAlienEnemy(ctx, x, y);
    } else if (this.type === "charger") {
      ctx.shadowColor = "#ff765e"; ctx.shadowBlur = 9;
      ctx.fillStyle = "#b84948";
      ctx.beginPath();
      ctx.moveTo(x + 2, y + 27); ctx.lineTo(x + 21, y + 4); ctx.lineTo(x + 41, y + 10);
      ctx.lineTo(x + 49, y + 24); ctx.lineTo(x + 37, y + 40); ctx.lineTo(x + 13, y + 47); ctx.closePath(); ctx.fill();
      ctx.shadowBlur = 0; ctx.fillStyle = "#ffcf81";
      ctx.beginPath(); ctx.ellipse(x + 35, y + 17, 5, 3, -.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#451f32"; ctx.fillRect(x + 8, y + 29, 19, 5);
      ctx.fillStyle = "#343044"; ctx.fillRect(x + 3, y + 34, 9, 6);
      ctx.fillStyle = "#ff9a61"; ctx.fillRect(x + 2, y + 35, 4, 4);
      ctx.fillStyle = "#ff8c5f";
      ctx.fillRect(x - 5, y + 25 + Math.random() * 3, 9, 3);
    } else if (this.type === "sentry") {
      ctx.fillStyle = "#596478";
      ctx.fillRect(x + 5, y + 14, 33, 43);
      ctx.fillStyle = "#8b95a0";
      ctx.fillRect(x + 1, y + 32, 42, 8);
      ctx.fillStyle = "#343b4a";
      ctx.fillRect(x - 7, y + 30, 13, 6);
      ctx.fillStyle = "#ff644f";
      ctx.fillRect(x - 8, y + 31, 3, 4);
      ctx.fillStyle = "#30384a";
      ctx.fillRect(x + 10, y + 5, 23, 18);
      ctx.fillStyle = "#ff644f";
      ctx.shadowColor = "#ff644f"; ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.arc(x + 22, y + 14, 5, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#d4ff48"; ctx.fillRect(x + 15, y + 52, 4, 7); ctx.fillRect(x + 27, y + 52, 4, 7);
    } else {
      ctx.translate(x + this.width / 2, y + this.height / 2);
      ctx.rotate(Math.sin(this.game.elapsed * 2.3 + this.phase) * .08);
      ctx.translate(-this.width / 2, -this.height / 2);
      ctx.fillStyle = "#76748e";
      ctx.beginPath(); ctx.moveTo(4, 26); ctx.lineTo(17, 8); ctx.lineTo(43, 4);
      ctx.lineTo(53, 25); ctx.lineTo(43, 47); ctx.lineTo(17, 45); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#9e99ab";
      ctx.beginPath(); ctx.moveTo(17, 10); ctx.lineTo(36, 12); ctx.lineTo(43, 26); ctx.lineTo(29, 30); ctx.lineTo(11, 24); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#b7f4ff";
      ctx.beginPath(); ctx.arc(29, 21, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#ed6c67";
      ctx.fillRect(5, 23, 5, 5); ctx.fillRect(44, 23, 5, 5);
      ctx.fillStyle = "#ffad58";
      ctx.beginPath(); ctx.arc(29, 43, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#373244";
      ctx.beginPath(); ctx.arc(29, 43, 3, 0, Math.PI * 2); ctx.fill();
    }
    const maxHp = this.type === "ship" ? 4 : this.type === "charger" ? 2 : 3;
    if (this.hp < maxHp) {
      ctx.fillStyle = "#1c2029"; ctx.fillRect(x + 8, y - 9, this.width - 16, 3);
      ctx.fillStyle = "#d4ff48"; ctx.fillRect(x + 8, y - 9, (this.width - 16) * this.hp / maxHp, 3);
    }
    ctx.restore();
  }

  drawFlyingShip(ctx, x, y) {
    ctx.shadowColor = "#54dff0";
    ctx.shadowBlur = 14;
    ctx.fillStyle = "#344d59";
    ctx.beginPath();
    ctx.moveTo(x + 2, y + 19);
    ctx.lineTo(x + 19, y + 8);
    ctx.lineTo(x + 49, y + 6);
    ctx.lineTo(x + 68, y + 18);
    ctx.lineTo(x + 51, y + 30);
    ctx.lineTo(x + 19, y + 28);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#91f1ed";
    ctx.beginPath();
    ctx.moveTo(x + 24, y + 9);
    ctx.lineTo(x + 44, y + 9);
    ctx.lineTo(x + 53, y + 17);
    ctx.lineTo(x + 28, y + 17);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#ff735f";
    ctx.fillRect(x + 3, y + 17, 6, 4);
    ctx.fillRect(x + 61, y + 17, 7, 4);
    ctx.shadowColor = "#63eaff";
    ctx.shadowBlur = 12;
    ctx.fillStyle = "#63eaff";
    ctx.beginPath();
    ctx.moveTo(x + 8, y + 21);
    ctx.lineTo(x - 5 - Math.random() * 7, y + 19);
    ctx.lineTo(x + 8, y + 17);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#27313c";
    ctx.fillRect(x + 25, y + 23, 22, 3);
  }

  drawAlienEnemy(ctx, x, y) {
    if (this.type === "sentry") {
      ctx.shadowColor = "#65dcff";
      ctx.shadowBlur = 12;
      ctx.fillStyle = "#556d70";
      ctx.fillRect(x + 6, y + 13, 31, 43);
      ctx.fillStyle = "#a9c6b4";
      ctx.fillRect(x + 1, y + 30, 42, 8);
      ctx.fillStyle = "#263e48";
      ctx.fillRect(x + 10, y + 4, 24, 19);
      ctx.fillStyle = "#65dcff";
      ctx.beginPath();
      ctx.arc(x + 22, y + 13, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#c5ed8a";
      ctx.fillRect(x + 14, y + 53, 5, 7);
      ctx.fillRect(x + 27, y + 53, 5, 7);
      return;
    }

    ctx.translate(x + this.width / 2, y + this.height / 2);
    ctx.rotate(this.type === "drifter" ? Math.sin(this.game.elapsed * 2.3 + this.phase) * .08 : 0);
    ctx.translate(-this.width / 2, -this.height / 2);
    ctx.shadowColor = this.type === "charger" ? "#a2e35f" : "#56dce0";
    ctx.shadowBlur = 12;
    ctx.fillStyle = this.type === "charger" ? "#678d45" : "#4f7779";
    ctx.beginPath();
    ctx.moveTo(5, 29);
    ctx.lineTo(13, 12);
    ctx.lineTo(21, 16);
    ctx.lineTo(27, 5);
    ctx.lineTo(34, 16);
    ctx.lineTo(44, 12);
    ctx.lineTo(51, 28);
    ctx.lineTo(42, 43);
    ctx.lineTo(13, 43);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#d8f1a0";
    ctx.beginPath();
    ctx.ellipse(29, 23, 10, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#17282a";
    ctx.beginPath();
    ctx.arc(25, 23, 2, 0, Math.PI * 2);
    ctx.arc(33, 23, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#77e8db";
    ctx.fillRect(13, 34, 6, 5);
    ctx.fillRect(39, 34, 6, 5);
  }
}

class EnemyProjectile {
  constructor(game, x, y, type = "aimed-bolt", angle = Math.PI, vx = null, vy = null) {
    this.game = game;
    this.x = x;
    this.y = y;
    this.type = type;
    this.radius = type === "arc-mine" ? 8 : type === "scatter" ? 4 : 5;
    const speed = type === "scatter" ? 345 : 395;
    this.vx = vx === null ? Math.cos(angle) * speed : vx;
    this.vy = vy === null ? Math.sin(angle) * speed : vy;
    this.gravity = type === "arc-mine" ? 560 : 0;
    this.dead = false;
  }

  update(dt) {
    const previousY = this.y;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.vy += this.gravity * dt;
    const player = this.game.player;
    if (this.x + this.radius > player.x + 5 && this.x - this.radius < player.x + player.width - 5 &&
        this.y + this.radius > player.y + 8 && this.y - this.radius < player.y + player.height - 5) {
      this.dead = true;
      player.hit();
      this.game.addBurst(this.x, this.y, this.type === "arc-mine" ? "#ffad58" : "#ff644f", 8, 120);
      return;
    }
    if (this.type === "arc-mine") {
      const hitFloor = this.y + this.radius >= player.floor && this.vy > 0;
      const hitPlatform = this.vy > 0 && this.game.platforms.some((platform) =>
        this.x >= platform.x && this.x <= platform.x + platform.width &&
        previousY + this.radius <= platform.y && this.y + this.radius >= platform.y);
      if (hitFloor || hitPlatform) {
        this.detonate();
        return;
      }
    }
    if (this.x < -20 || this.x > this.game.width + 20 || this.y > this.game.height + 20) {
      if (this.type === "arc-mine") this.detonate();
      else this.dead = true;
    }
  }

  detonate() {
    if (this.dead) return;
    this.dead = true;
    this.game.explosions.push(new Explosion(this.x, this.y, this.game, true));
  }

  draw(ctx) {
    const color = this.type === "arc-mine" ? "#ffad58" : this.type === "scatter" ? "#ff957b" : "#ff4f67";
    ctx.save();
    ctx.shadowColor = color; ctx.shadowBlur = this.type === "arc-mine" ? 17 : 12; ctx.fillStyle = color;
    if (this.type === "arc-mine") {
      ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#fff0bc"; ctx.fillRect(this.x - 2, this.y - 2, 4, 4);
      ctx.fillStyle = "#ff704e"; ctx.fillRect(this.x - 3, this.y - 11, 6, 4);
    } else {
      ctx.beginPath(); ctx.ellipse(this.x, this.y, this.radius * 1.8, this.radius * .72,
        Math.atan2(this.vy, this.vx), 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
}

class Particle {
  constructor(x, y, color, speed) {
    const angle = Math.random() * Math.PI * 2;
    const velocity = speed * (0.35 + Math.random() * 0.65);
    this.x = x; this.y = y;
    this.vx = Math.cos(angle) * velocity;
    this.vy = Math.sin(angle) * velocity;
    this.life = this.maxLife = 0.25 + Math.random() * 0.45;
    this.size = 1.5 + Math.random() * 3.5;
    this.color = color;
  }
  update(dt) { this.x += this.vx * dt; this.y += this.vy * dt; this.life -= dt; }
  draw(ctx) {
    ctx.globalAlpha = Math.max(0, this.life / this.maxLife);
    ctx.fillStyle = this.color;
    ctx.fillRect(this.x, this.y, this.size, this.size);
    ctx.globalAlpha = 1;
  }
}

class AudioManager {
  constructor() { this.enabled = false; this.context = null; }
  toggle() {
    this.enabled = !this.enabled;
    if (this.enabled && !this.context) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) this.context = new AudioContextClass();
    }
    if (this.enabled && this.context && this.context.state === "suspended") this.context.resume();
  }
  play(type) {
    if (!this.enabled || !this.context) return;
    const settings = {
      shoot: [510, .055, "square", .035], jump: [260, .12, "sine", .05],
      hit: [105, .22, "sawtooth", .07], explode: [75, .28, "triangle", .065],
      pickup: [740, .16, "sine", .055]
    }[type];
    if (!settings) return;
    const [frequency, duration, wave, volume] = settings;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = wave;
    oscillator.frequency.setValueAtTime(frequency, this.context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(35, frequency * .48), this.context.currentTime + duration);
    gain.gain.setValueAtTime(volume, this.context.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001, this.context.currentTime + duration);
    oscillator.connect(gain); gain.connect(this.context.destination);
    oscillator.start(); oscillator.stop(this.context.currentTime + duration);
  }
}

class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.width = 0;
    this.height = 0;
    this.state = "menu";
    this.weapon = "single";
    this.unlockedWeapons = new Set(["single", "rapid"]);
    this.weaponCycle = ["single", "rapid", "spread", "rapid-spread", "grenade"];
    this.weaponAmmo = { spread: 0, "rapid-spread": 0, grenade: 0 };
    this.speed = 250;
    this.elapsed = 0;
    this.score = 0;
    this.distance = 0;
    this.spawnTimer = 0;
    this.shake = 0;
    this.stars = [];
    this.dust = [];
    this.platforms = [];
    this.enemies = [];
    this.projectiles = [];
    this.enemyProjectiles = [];
    this.particles = [];
    this.pickups = [];
    this.caveHazards = [];
    this.caveHazardTimer = 1.2;
    this.explosions = [];
    this.platformTimer = 0;
    this.nextWeaponDrop = 100;
    this.nextAutoAimDrop = 700;
    this.nextDoubleHealthDrop = 600;
    this.nextHealthDrop = 200;
    this.nextShieldDrop = 600;
    this.nextJetpackDrop = 2000;
    this.nextDashDrop = 3000;
    this.healthUpgradeApplied = false;
    this.healthUpgrade2000Applied = false;
    this.healthUpgrade3000Applied = false;
    this.alienWorldAnnounced = false;
    this.caveWorldAnnounced = false;
    this.cityWorldAnnounced = false;
    this.pickupMessageTimer = 0;
    this.enemyWeaponUnlocks = new Set();
    this.nextEnemyWeaponUnlock = 500;
    this.best = Number(localStorage.getItem("starfall-best") || 0);
    this.player = new Player(this);
    this.input = new InputHandler(this);
    this.audio = new AudioManager();
    this.overlay = document.getElementById("overlay");
    this.resize();
    this.bindUI();
    this.updateHUD();
    window.addEventListener("resize", () => this.resize());
    this.lastTime = performance.now();
    requestAnimationFrame((time) => this.loop(time));
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const previousHeight = this.height;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = rect.width;
    this.height = rect.height;
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.player.x = this.width * 0.14;
    if (previousHeight) this.player.y += this.height * 0.78 - previousHeight * 0.78;
    if (this.player.grounded || this.state === "menu") this.player.y = this.player.floor - this.player.height;
    this.stars = Array.from({ length: 85 }, () => ({
      x: Math.random() * this.width, y: Math.random() * this.height * .71,
      size: Math.random() * 1.7 + .3, depth: .12 + Math.random() * .55
    }));
    this.dust = Array.from({ length: 24 }, () => ({
      x: Math.random() * this.width, y: Math.random() * this.height * .72,
      size: Math.random() * 3 + 1, depth: .2 + Math.random() * .4
    }));
  }

  bindUI() {
    document.getElementById("start-button").addEventListener("click", () => {
      if (this.state === "paused") this.togglePause();
      else this.start();
    });
    document.getElementById("pause-button").addEventListener("click", () => this.togglePause());
    document.getElementById("reset-button").addEventListener("click", () => this.start());
    document.getElementById("sound-toggle").addEventListener("click", (event) => {
      this.audio.toggle();
      event.currentTarget.classList.toggle("sound-on", this.audio.enabled);
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && this.state === "running") this.pause();
    });
  }

  start() {
    this.state = "running";
    this.score = 0;
    this.distance = 0;
    this.elapsed = 0;
    this.speed = 250;
    this.spawnTimer = 1;
    this.platformTimer = 1.5;
    this.shake = 0;
    this.platforms = [];
    this.enemies = [];
    this.projectiles = [];
    this.enemyProjectiles = [];
    this.particles = [];
    this.pickups = [];
    this.caveHazards = [];
    this.caveHazardTimer = 1.2;
    this.explosions = [];
    this.nextWeaponDrop = 100;
    this.nextAutoAimDrop = 700;
    this.nextDoubleHealthDrop = 600;
    this.nextHealthDrop = 200;
    this.nextShieldDrop = 600;
    this.nextJetpackDrop = 2000;
    this.nextDashDrop = 3000;
    this.healthUpgradeApplied = false;
    this.healthUpgrade2000Applied = false;
    this.healthUpgrade3000Applied = false;
    this.alienWorldAnnounced = false;
    this.caveWorldAnnounced = false;
    this.cityWorldAnnounced = false;
    this.pickupMessageTimer = 0;
    this.enemyWeaponUnlocks.clear();
    this.nextEnemyWeaponUnlock = 500;
    this.unlockedWeapons = new Set(["single", "rapid"]);
    this.weaponAmmo = { spread: 0, "rapid-spread": 0, grenade: 0 };
    this.weapon = "single";
    this.player.health = 3;
    this.player.maxHealth = 4;
    this.player.setCrouching(false);
    this.player.velocityY = 0;
    this.player.grounded = true;
    this.player.invulnerable = 0;
    this.player.shieldTimer = 0;
    this.player.dashActive = false;
    this.player.dashInvulnerability = 0;
    this.player.jetpackTimer = 0;
    this.player.fireCooldown = 0;
    this.player.autoAimCooldown = 0;
    this.player.autoAimActive = false;
    this.player.y = this.player.floor - this.player.height;
    this.player.jumpBuffer = 0;
    this.player.jumpsUsed = 0;
    this.setWeapon("single");
    this.updateHealth();
    this.updateHUD();
    this.overlay.classList.add("hidden");
  }

  togglePause() {
    if (this.state === "running") this.pause();
    else if (this.state === "paused") {
      this.state = "running";
      this.overlay.classList.add("hidden");
    }
  }

  pause() {
    this.state = "paused";
    this.showOverlay("FLIGHT RECORDER PAUSED", "TAKE A<br>BREATHER<span>.</span>", "The ship can wait. The monsters probably can't.", "RESUME ESCAPE", "CTRL / ESC / P RESUME · ← / → RUN · ↑ JUMP · ↓ CROUCH / DROP · SPACE FIRE · Z WEAPON");
  }

  end() {
    this.state = "over";
    this.best = Math.max(this.best, Math.floor(this.distance));
    localStorage.setItem("starfall-best", String(this.best));
    this.updateHUD();
    this.showOverlay("SIGNAL LOST // RUN ENDED", "THAT'S A<br>WRAP<span>.</span>", `${Math.floor(this.distance)} meters survived. ${this.score} threat units neutralized.`, "RUN IT BACK", `BEST DISTANCE ${String(this.best).padStart(5, "0")} M`);
  }

  showOverlay(kicker, title, copy, button, hint) {
    document.getElementById("overlay-kicker").textContent = kicker;
    document.getElementById("overlay-title").innerHTML = title;
    document.getElementById("overlay-copy").textContent = copy;
    document.getElementById("start-label").textContent = button;
    document.getElementById("control-hint").innerHTML = hint;
    this.overlay.classList.remove("hidden");
  }

  toggleWeapon() {
    const currentIndex = this.weaponCycle.indexOf(this.weapon);
    for (let step = 1; step <= this.weaponCycle.length; step++) {
      const candidate = this.weaponCycle[(currentIndex + step) % this.weaponCycle.length];
      if (this.isWeaponAvailable(candidate)) {
        this.setWeapon(candidate);
        return;
      }
    }
  }

  setWeapon(weapon) {
    this.weapon = weapon;
    const names = {
      single: "SINGLE SHOT",
      rapid: "RAPID FIRE",
      spread: "VECTOR SPREAD",
      "rapid-spread": "RAPID VECTOR SPREAD",
      grenade: "GRENADE LAUNCHER"
    };
    document.getElementById("weapon-name").textContent = names[weapon];
    document.getElementById("weapon-key").textContent = "Z";
    const ammo = document.getElementById("weapon-ammo");
    const limitedAmmo = this.isAmmoWeapon(weapon);
    ammo.textContent = limitedAmmo ? `${this.weaponAmmo[weapon]} SHOTS` : "";
    ammo.classList.toggle("has-ammo", limitedAmmo);
  }

  isWeaponAvailable(weapon) {
    if (!this.unlockedWeapons.has(weapon)) return false;
    return !this.isAmmoWeapon(weapon) || this.weaponAmmo[weapon] > 0;
  }

  isAmmoWeapon(weapon) {
    return weapon === "spread" || weapon === "rapid-spread" || weapon === "grenade";
  }

  expireWeapon(weapon) {
    this.unlockedWeapons.delete(weapon);
    this.weaponAmmo[weapon] = 0;
    if (this.weapon === weapon) {
      const fallback = this.weaponCycle.find((candidate) => this.isWeaponAvailable(candidate));
      this.setWeapon(fallback || "single");
      const name = { spread: "VECTOR SPREAD", "rapid-spread": "RAPID VECTOR SPREAD", grenade: "GRENADE LAUNCHER" }[weapon];
      this.showPickupMessage(`${name} DEPLETED`);
    } else {
      this.setWeapon(this.weapon);
    }
  }

  consumeWeaponAmmo(weapon) {
    if (!this.isAmmoWeapon(weapon)) return;
    this.weaponAmmo[weapon] = Math.max(0, this.weaponAmmo[weapon] - 1);
    if (this.weaponAmmo[weapon] === 0) this.expireWeapon(weapon);
    else this.setWeapon(weapon);
  }

  showPickupMessage(message) {
    const toast = document.getElementById("pickup-toast");
    toast.textContent = message;
    toast.classList.toggle("health-toast", message.startsWith("HULL"));
    toast.classList.add("visible");
    this.pickupMessageTimer = 2.4;
  }

  detonate(x, y) {
    const radius = 76;
    this.explosions.push(new Explosion(x, y));
    this.audio.play("explode");
    this.shake = Math.max(this.shake, 5);
    this.addBurst(x, y, "#ff9d58", 20, 200);
    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      const dx = enemy.x + enemy.width / 2 - x;
      const dy = enemy.y + enemy.height / 2 - y;
      if (Math.hypot(dx, dy) <= radius + Math.min(enemy.width, enemy.height) * .35) {
        enemy.damage(4);
      }
    }
  }

  getCaveHoleUnder(x) {
    if (this.distance < 3000 || this.distance >= 4000) return null;
    return this.caveHazards.find((hazard) =>
      !hazard.dead && hazard.type === "hole" && x >= hazard.x && x <= hazard.x + hazard.width
    ) || null;
  }

  isCaveHoleOverlapping(x) {
    return Boolean(this.getCaveHoleUnder(x));
  }

  playerFallsIntoCaveHole(player, hole) {
    if (hole.triggered) return;
    hole.triggered = true;
    player.hit();
    player.x = Math.max(8, Math.min(this.width - player.width - 8, hole.x + hole.width + 10));
    player.y = player.floor - player.height;
    player.velocityY = 0;
    player.grounded = true;
    this.addBurst(player.x + player.width / 2, player.floor - 5, "#9ba087", 10, 135);
  }

  enemyFallsIntoCaveHole(enemy) {
    if (enemy.dead) return;
    enemy.dead = true;
    this.score += enemy.score;
    this.addBurst(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, "#9ba087", 12, 145);
  }

  spawnCaveHazard() {
    const roll = Math.random();
    const holeAlreadyActive = this.caveHazards.some((hazard) =>
      !hazard.dead && hazard.type === "hole"
    );
    const type = roll < .34 && !holeAlreadyActive
      ? "hole"
      : roll < .67 ? "ground-spikes" : "falling-spike";
    this.caveHazards.push(new CaveHazard(this, type, this.width + 24));
    this.caveHazardTimer = 1.15 + Math.random() * 1.25;
  }

  updateHealth() {
    const container = document.getElementById("health-pips");
    while (container.children.length < this.player.maxHealth) container.appendChild(document.createElement("i"));
    while (container.children.length > this.player.maxHealth) container.lastElementChild.remove();
    Array.from(container.children).forEach((pip, index) => {
      pip.classList.toggle("empty", index >= this.player.health);
    });
    container.setAttribute("aria-label", `${this.player.health} of ${this.player.maxHealth} hull points remaining`);
  }

  updateHUD() {
    document.getElementById("distance").textContent = String(Math.floor(this.distance)).padStart(5, "0");
    document.getElementById("best").textContent = String(this.best).padStart(5, "0");
  }

  addBurst(x, y, color, count, speed) {
    for (let i = 0; i < count; i++) this.particles.push(new Particle(x, y, color, speed));
  }

  loop(time) {
    const dt = Math.min((time - this.lastTime) / 1000, .035);
    this.lastTime = time;
    if (this.state === "running") this.update(dt);
    else {
      for (const particle of this.particles) particle.update(dt);
      this.particles = this.particles.filter((particle) => particle.life > 0);
    }
    this.draw(dt);
    requestAnimationFrame((nextTime) => this.loop(nextTime));
  }

  update(dt) {
    this.elapsed += dt;
    this.distance += this.speed * dt * .035;
    this.speed = Math.min(430, 250 + this.distance * .16);
    this.score += dt * 5;
    this.processMilestones();
    this.processEnemyWeaponUnlocks();
    if (this.distance >= 3000 && this.distance < 4000) {
      this.caveHazardTimer -= dt;
      if (this.caveHazardTimer <= 0) this.spawnCaveHazard();
    }
    for (const hazard of this.caveHazards) hazard.update(dt);
    this.player.update(dt);
    if (this.distance >= 3000 && this.distance < 4000) {
      for (const hazard of this.caveHazards) hazard.checkPlayerCollision(this.player);
    }
    for (const platform of this.platforms) platform.update(dt);
    for (const pickup of this.pickups) pickup.update(dt);
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnEnemy();
      this.spawnTimer = Math.max(.68, 1.5 - this.distance * .0008) + Math.random() * .75;
    }
    this.platformTimer -= dt;
    if (this.platformTimer <= 0) {
      this.spawnPlatform();
      const platformInterval = this.distance >= 500
        ? 2.7 + Math.random() * 1.1
        : 3.1 + Math.random() * 1.2;
      this.platformTimer = platformInterval;
    }
    for (const enemy of this.enemies) enemy.update(dt);
    for (const projectile of this.projectiles) projectile.update(dt);
    for (const projectile of this.enemyProjectiles) projectile.update(dt);
    for (const particle of this.particles) particle.update(dt);
    for (const explosion of this.explosions) explosion.update(dt);
    this.enemies = this.enemies.filter((enemy) => !enemy.dead);
    this.platforms = this.platforms.filter((platform) => !platform.dead);
    this.projectiles = this.projectiles.filter((projectile) => !projectile.dead);
    this.enemyProjectiles = this.enemyProjectiles.filter((projectile) => !projectile.dead);
    this.pickups = this.pickups.filter((pickup) => !pickup.dead);
    this.caveHazards = this.caveHazards.filter((hazard) => !hazard.dead);
    this.explosions = this.explosions.filter((explosion) => explosion.life > 0);
    this.particles = this.particles.filter((particle) => particle.life > 0);
    this.shake = Math.max(0, this.shake - 28 * dt);
    this.pickupMessageTimer = Math.max(0, this.pickupMessageTimer - dt);
    if (this.pickupMessageTimer === 0) document.getElementById("pickup-toast").classList.remove("visible");
    this.updateHUD();
  }

  processMilestones() {
    if (!this.cityWorldAnnounced && this.distance >= 4000) {
      this.cityWorldAnnounced = true;
      this.showPickupMessage("4000M · UNDERGROUND CITY · FLYING SHIPS INBOUND");
    }
    if (!this.caveWorldAnnounced && this.distance >= 3000) {
      this.caveWorldAnnounced = true;
      this.showPickupMessage("3000M · ALIEN CAVE · WATCH FOR FALLING STALACTITES");
    }
    if (!this.alienWorldAnnounced && this.distance >= 1000) {
      this.alienWorldAnnounced = true;
      this.showPickupMessage("1000M · ALIEN WILDS · HOSTILE LIFE FORMS DETECTED");
    }
    if (!this.healthUpgradeApplied && this.distance >= 500) {
      this.healthUpgradeApplied = true;
      this.player.health = Math.min(this.player.maxHealth, this.player.health + 1);
      this.updateHealth();
      this.showPickupMessage("500M HULL REPAIR · INTEGRITY +1");
    }
    if (!this.healthUpgrade2000Applied && this.distance >= 2000) {
      this.healthUpgrade2000Applied = true;
      const addedCapacity = this.healthCap - this.player.maxHealth;
      this.player.maxHealth = this.healthCap;
      this.player.health = Math.min(this.player.maxHealth, this.player.health + addedCapacity);
      this.updateHealth();
      this.showPickupMessage("2000M HULL UPGRADE · MAX INTEGRITY 7");
    }
    if (!this.healthUpgrade3000Applied && this.distance >= 3000) {
      this.healthUpgrade3000Applied = true;
      const addedCapacity = this.healthCap - this.player.maxHealth;
      this.player.maxHealth = this.healthCap;
      this.player.health = Math.min(this.player.maxHealth, this.player.health + addedCapacity);
      this.updateHealth();
      this.showPickupMessage("3000M HULL UPGRADE · MAX INTEGRITY 10");
    }
    while (this.distance >= this.nextWeaponDrop) {
      const milestone = this.nextWeaponDrop;
      const weapon = milestone >= 600 && (milestone - 600) % 400 === 0
        ? "rapid-spread"
        : milestone === 100 || ((milestone - 200) / 200) % 2 === 1
          ? "spread"
          : "grenade";
      this.pickups.push(new Pickup(this, weapon, this.randomPickupX(19), milestone));
      this.nextWeaponDrop += milestone < 200 ? 100 : 200;
    }
    while (this.distance >= this.nextAutoAimDrop) {
      const milestone = this.nextAutoAimDrop;
      this.pickups.push(new Pickup(this, "auto-aim", this.randomPickupX(19), milestone));
      this.nextAutoAimDrop += 250;
    }
    while (this.distance >= this.nextDoubleHealthDrop) {
      const milestone = this.nextDoubleHealthDrop;
      this.pickups.push(new Pickup(this, "double-health", this.randomPickupX(17), milestone));
      this.nextDoubleHealthDrop += 200;
    }
    while (this.distance >= this.nextHealthDrop) {
      const milestone = this.nextHealthDrop;
      this.pickups.push(new Pickup(this, "health", this.randomPickupX(17), milestone));
      this.nextHealthDrop += milestone < 200 ? 200 : 100;
    }
    while (this.distance >= this.nextShieldDrop) {
      const milestone = this.nextShieldDrop;
      this.pickups.push(new Pickup(this, "shield", this.randomPickupX(19), milestone));
      this.nextShieldDrop += 300;
    }
    while (this.distance >= this.nextJetpackDrop) {
      const milestone = this.nextJetpackDrop;
      this.pickups.push(new Pickup(this, "jetpack", this.randomPickupX(19), milestone));
      this.nextJetpackDrop += 800;
    }
    while (this.distance >= this.nextDashDrop) {
      const milestone = this.nextDashDrop;
      this.pickups.push(new Pickup(this, "dash", this.randomPickupX(19), milestone));
      this.nextDashDrop += 800;
    }
  }

  randomPickupX(size) {
    return Math.random() * Math.max(0, this.width - size);
  }

  processEnemyWeaponUnlocks() {
    const unlocks = [
      { distance: 500, weapon: "scatter", label: "CHARGER SCATTER CANNONS" },
      { distance: 1000, weapon: "arc-mine", label: "DRIFTER ARC MINES" }
    ];
    while (this.nextEnemyWeaponUnlock <= this.distance) {
      const unlock = unlocks.find((item) => item.distance === this.nextEnemyWeaponUnlock);
      if (unlock) {
        this.enemyWeaponUnlocks.add(unlock.weapon);
        this.showPickupMessage(`ENEMY ARSENAL UPGRADED · ${unlock.label} ONLINE`);
      }
      this.nextEnemyWeaponUnlock += 500;
    }
  }

  get healthCap() {
    if (this.distance >= 3000) return 10;
    if (this.distance >= 2000) return 7;
    return 4;
  }

  get enemyScreenLimit() {
    if (this.distance < 1000) {
      if (this.distance <= 150) return 2;
      return Math.ceil(this.distance / 150) + 1 + Number(this.distance >= 500);
    }
    if (this.distance >= 2000) {
      const cap = this.distance >= 4000 ? 10 : 9;
      return Math.min(cap, 7 + Math.floor((this.distance - 2000) / 250));
    }
    const alienStartLimit = Math.floor(Math.ceil(1000 / 150) / 2);
    return alienStartLimit + Math.floor((this.distance - 1000) / 150);
  }

  canSpawnEnemy() {
    return this.enemies.filter((enemy) => !enemy.dead).length < this.enemyScreenLimit;
  }

  get enemyFireRateMultiplier() {
    if (this.distance >= 2000) return 0.55;
    if (this.distance >= 1000) return 0.75;
    return 0.85;
  }

  isEnemyTrackingWeapon(weapon) {
    return weapon === "aimed-bolt" || weapon === "scatter" || weapon === "arc-mine";
  }

  canEnemyUseTrackingWeapon(excludedEnemy = null) {
    const trackingEnemies = this.enemies.filter((enemy) =>
      !enemy.dead && enemy !== excludedEnemy && this.isEnemyTrackingWeapon(enemy.weapon)
    ).length;
    return trackingEnemies < 1;
  }

  get enemySpreadLimit() {
    return this.distance < 500 ? 0 : 1;
  }

  spawnEnemy() {
    if (!this.canSpawnEnemy()) return;
    const roll = Math.random();
    let type;
    if (this.distance >= 4000 && roll < .38) type = "ship";
    else if (this.distance < 90) type = roll < .68 ? "charger" : "sentry";
    else if (roll < .47) type = "charger";
    else if (roll < .76) type = "sentry";
    else type = "drifter";
    const x = type === "sentry" || type === "ship"
      ? this.width + 20 + Math.random() * 90
      : this.width + 25;
    this.enemies.push(new Enemy(this, type, x));
  }

  spawnPlatform() {
    const width = Math.min(250, Math.max(175, this.width * 0.28)) + Math.random() * Math.min(38, this.width * 0.05);
    const baseElevation = Math.min(90, this.height * 0.19) +
      Math.random() * Math.min(20, this.height * 0.045);
    const maxReachableElevation = Math.min(160, (740 * 740) / (2 * 1550) - 18);
    const minElevation = Math.min(65, maxReachableElevation);
    const distanceAboveIntroduction = Math.max(0, this.distance - 450);
    const upperPlatformChance = Math.min(1, distanceAboveIntroduction / 400);
    const thirdPlatformChance = Math.min(1, Math.max(0, this.distance - 650) / 500);
    let platformX = this.width + 35;
    let platformWidth = width;
    const hasUpperPlatform = Math.random() < upperPlatformChance;
    const hasThirdPlatform = hasUpperPlatform && Math.random() < thirdPlatformChance;
    const platformCount = 1 + Number(hasUpperPlatform) + Number(hasThirdPlatform);
    const pickupChance = this.distance <= 200
      ? 0.72
      : Math.max(0.12, 0.45 - (this.distance - 200) * 0.0007);
    const pickupTypes = this.distance >= 3000
      ? ["health", "double-health", "spread", "rapid-spread", "grenade", "auto-aim",
        "shield", "shield", "dash", "jetpack"]
      : this.distance >= 2000
      ? ["health", "double-health", "spread", "rapid-spread", "grenade", "auto-aim",
        "shield", "jetpack"]
      : this.distance >= 1000
      ? ["health", "double-health", "spread", "rapid-spread", "grenade", "auto-aim",
        "shield"]
      : this.distance >= 600
      ? ["health", "double-health", "spread", "rapid-spread", "grenade", "auto-aim",
        "auto-aim"]
      : this.distance >= 500
        ? ["health", "double-health", "spread", "rapid-spread", "grenade"]
      : ["health", "spread", "grenade"];
    const pickupType = Math.random() < pickupChance
      ? pickupTypes[Math.floor(Math.random() * pickupTypes.length)]
      : null;
    const pickupPlatformIndex = pickupType
      ? Math.floor(Math.random() * platformCount)
      : -1;
    let previousElevation = baseElevation;

    for (let step = 0; step < platformCount; step++) {
      const elevation = step === 0
        ? baseElevation
        : Math.max(minElevation, Math.min(
          maxReachableElevation,
          previousElevation + (Math.random() * 2 - 1) * Math.min(38, maxReachableElevation - minElevation)
        ));
      this.addPlatformSegment(
        platformX,
        platformWidth,
        elevation,
        step === pickupPlatformIndex ? pickupType : null
      );
      const spacingFactor = this.distance >= 500
        ? 0.62 + Math.random() * 0.08
        : 0.72;
      platformX += platformWidth * spacingFactor;
      platformWidth = Math.max(125, width * (0.68 + Math.random() * 0.12));
      previousElevation = elevation;
    }
  }

  addPlatformSegment(x, width, elevation, pickupType = null) {
    const platform = new Platform(this, x, width, elevation, pickupType);
    this.platforms.push(platform);
    if (pickupType) {
      const pickupSize = pickupType === "health" || pickupType === "double-health" ? 17 : 19;
      const pickupX = platform.x + Math.random() * Math.max(0, width - pickupSize);
      this.pickups.push(new Pickup(this, pickupType, pickupX, null, platform));
    }
    if (this.canSpawnEnemy()) {
      const enemyType = Math.random() < 0.58 ? "charger" : "sentry";
      this.enemies.push(new Enemy(this, enemyType, platform.x, platform));
    }
  }

  drawBackground(dt) {
    const ctx = this.ctx, w = this.width, h = this.height, floor = h * .78;
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    const alienBiome = this.distance >= 1000;
    const cityBiome = this.distance >= 4000;
    const caveBiome = this.distance >= 3000 && !cityBiome;
    if (cityBiome) {
      gradient.addColorStop(0, "#07111c");
      gradient.addColorStop(.56, "#142b37");
      gradient.addColorStop(1, "#0b1722");
    } else if (caveBiome) {
      gradient.addColorStop(0, "#080b13");
      gradient.addColorStop(.55, "#161923");
      gradient.addColorStop(1, "#0c1017");
    } else if (alienBiome) {
      gradient.addColorStop(0, "#0b1726");
      gradient.addColorStop(.48, "#1a3038");
      gradient.addColorStop(1, "#101c24");
    } else {
      gradient.addColorStop(0, "#131928");
      gradient.addColorStop(.55, "#20283a");
      gradient.addColorStop(1, "#111723");
    }
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, w, h);
    if (!caveBiome && !cityBiome) {
      const nebula = ctx.createRadialGradient(w * .73, h * .33, 2, w * .73, h * .33, w * .58);
      nebula.addColorStop(0, alienBiome ? "#80ad5740" : "#30293c55");
      nebula.addColorStop(1, alienBiome ? "#80ad5700" : "#30293c00");
      ctx.fillStyle = nebula; ctx.fillRect(0, 0, w, floor);
    }
    if (!caveBiome && !cityBiome) {
      for (const star of this.stars) {
        star.x -= (this.state === "running" ? this.speed : 14) * star.depth * dt * .18;
        if (star.x < 0) { star.x = w; star.y = Math.random() * floor; }
        ctx.globalAlpha = .28 + star.depth * .72;
        ctx.fillStyle = alienBiome
          ? star.depth > .52 ? "#e3f4b0" : "#a7c5a0"
          : star.depth > .52 ? "#d5edff" : "#8498b5";
        ctx.fillRect(star.x, star.y, star.size, star.size);
      }
      ctx.globalAlpha = 1;
      for (const mote of this.dust) {
        mote.x -= (this.state === "running" ? this.speed : 14) * mote.depth * dt * .3;
        if (mote.x < -5) { mote.x = w + 5; mote.y = Math.random() * floor; }
        ctx.globalAlpha = .12 + mote.depth * .2;
        ctx.fillStyle = "#e3e1d0";
        ctx.beginPath(); ctx.arc(mote.x, mote.y, mote.size, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    this.drawShipInterior(floor);
    for (const hazard of this.caveHazards) hazard.draw(ctx);
    for (const platform of this.platforms) platform.draw(ctx);
  }

  drawShipInterior(floor) {
    const ctx = this.ctx, w = this.width, h = this.height;
    if (this.distance >= 4000) {
      this.drawUndergroundCity(floor);
      return;
    }
    if (this.distance >= 3000) {
      this.drawAlienCave(floor);
      return;
    }
    if (this.distance >= 1000) {
      this.drawAlienLandscape(floor);
      return;
    }
    const wallHeight = floor - 17;
    const wallGradient = ctx.createLinearGradient(0, 0, 0, wallHeight);
    wallGradient.addColorStop(0, "#303b4b");
    wallGradient.addColorStop(.52, "#202a38");
    wallGradient.addColorStop(1, "#141c28");
    ctx.fillStyle = wallGradient;
    ctx.fillRect(0, 0, w, wallHeight);

    const wallScroll = (this.elapsed * this.speed * .12) % 190;
    for (let x = -wallScroll; x < w + 190; x += 190) {
      ctx.fillStyle = "#3c4858";
      ctx.fillRect(x, 0, 3, wallHeight);
      ctx.fillStyle = "#273342";
      ctx.fillRect(x + 5, 0, 2, wallHeight);
      ctx.fillStyle = "#111925";
      ctx.fillRect(x + 15, h * .055, 155, 2);
      ctx.fillRect(x + 15, h * .57, 155, 2);
      ctx.fillStyle = "#465365";
      ctx.fillRect(x + 19, h * .055 + 3, 145, 2);
      ctx.fillRect(x + 19, h * .57 + 3, 145, 2);
      ctx.fillStyle = "#8290a0";
      for (const boltY of [h * .055 + 7, h * .57 + 7]) {
        ctx.fillRect(x + 14, boltY, 3, 3);
        ctx.fillRect(x + 170, boltY, 3, 3);
      }
    }

    const windowHeight = Math.min(h * .28, wallHeight * .43);
    const windowY = h * .18;
    const windowWidth = Math.min(w * .27, 205);
    const windowGap = Math.max(20, w * .045);
    const windowStart = w * .08;
    for (let windowX = windowStart; windowX < w - 20; windowX += windowWidth + windowGap) {
      const paneX = Math.min(windowX, w - windowWidth - 12);
      ctx.fillStyle = "#080e18";
      ctx.fillRect(paneX - 7, windowY - 7, windowWidth + 14, windowHeight + 14);
      ctx.fillStyle = "#637384";
      ctx.fillRect(paneX - 5, windowY - 5, windowWidth + 10, 3);
      ctx.fillRect(paneX - 5, windowY + windowHeight + 2, windowWidth + 10, 3);
      ctx.fillRect(paneX - 5, windowY - 2, 3, windowHeight + 4);
      ctx.fillRect(paneX + windowWidth + 2, windowY - 2, 3, windowHeight + 4);
      const view = ctx.createLinearGradient(0, windowY, 0, windowY + windowHeight);
      view.addColorStop(0, "#06101f");
      view.addColorStop(.65, "#10243c");
      view.addColorStop(1, "#1c3043");
      ctx.fillStyle = view;
      ctx.fillRect(paneX, windowY, windowWidth, windowHeight);
      ctx.save();
      ctx.beginPath();
      ctx.rect(paneX, windowY, windowWidth, windowHeight);
      ctx.clip();
      for (const star of this.stars) {
        if (star.x < paneX || star.x > paneX + windowWidth ||
            star.y < windowY || star.y > windowY + windowHeight) continue;
        ctx.globalAlpha = .55 + star.depth * .45;
        ctx.fillStyle = star.depth > .52 ? "#f0f5ff" : "#a8c4e4";
        ctx.fillRect(star.x, star.y, star.size + .4, star.size + .4);
      }
      ctx.globalAlpha = 1;
      ctx.restore();
      ctx.fillStyle = "#8290a0";
      ctx.fillRect(paneX + windowWidth * .5 - 1, windowY, 2, windowHeight);
      ctx.fillStyle = "#b2c2d2";
      ctx.fillRect(paneX + 8, windowY + 7, Math.max(0, windowWidth * .32), 2);
    }

    ctx.fillStyle = "#101722";
    ctx.fillRect(0, wallHeight - 3, w, 7);
    ctx.fillStyle = "#526174";
    ctx.fillRect(0, wallHeight - 2, w, 2);

    ctx.fillStyle = "#151a24";
    ctx.fillRect(0, floor - 11, w, 16);
    ctx.fillStyle = "#3c4555";
    ctx.fillRect(0, floor - 11, w, 2);
    ctx.fillStyle = "#657083";
    ctx.fillRect(0, floor - 14, w, 3);
    const panelOffset = (this.elapsed * this.speed * .16) % 170;
    for (let x = -panelOffset; x < w + 170; x += 170) {
      ctx.fillStyle = "#333c4b"; ctx.fillRect(x, floor - 8, 110, 2);
      ctx.fillStyle = "#7f897d"; ctx.fillRect(x + 7, floor - 9, 24, 2);
    }
    const floorGradient = ctx.createLinearGradient(0, floor, 0, h);
    floorGradient.addColorStop(0, "#292c35"); floorGradient.addColorStop(1, "#11151e");
    ctx.fillStyle = floorGradient; ctx.fillRect(0, floor, w, h - floor);
    const grateOffset = (this.elapsed * this.speed * .55) % 68;
    ctx.strokeStyle = "#55545a55"; ctx.lineWidth = 1;
    for (let x = -grateOffset; x < w + 68; x += 68) {
      ctx.beginPath(); ctx.moveTo(x, floor + 13); ctx.lineTo(x - 15, h); ctx.stroke();
    }
    ctx.strokeStyle = "#42465088";
    for (let y = floor + 34; y < h; y += 32) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
    ctx.fillStyle = "#222836";
    ctx.fillRect(0, h * .19, 21, h * .36);
    ctx.fillRect(w - 22, h * .1, 22, h * .44);
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = i === 1 ? "#ff644f" : "#d4ff48";
      ctx.globalAlpha = .55 + Math.sin(this.elapsed * 4 + i) * .25;
      ctx.fillRect(7, h * .24 + i * 13, 3, 5);
      ctx.fillRect(w - 12, h * .16 + i * 14, 3, 5);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#d4ff48";
    ctx.globalAlpha = .65;
    ctx.fillRect(w * .27, floor - 3, 35, 2);
    ctx.fillRect(w * .69, floor - 3, 22, 2);
    ctx.globalAlpha = 1;
  }

  drawAlienLandscape(floor) {
    const ctx = this.ctx, w = this.width, h = this.height;
    const scroll = this.elapsed * this.speed;
    const moonX = w * .74 - (scroll * .025) % (w + 100);
    ctx.fillStyle = "#d3e69a";
    ctx.globalAlpha = .72;
    ctx.beginPath();
    ctx.arc(moonX, h * .22, Math.min(w, h) * .075, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    for (let layer = 0; layer < 3; layer++) {
      const baseY = floor - 38 - layer * 31;
      const tileWidth = 170 + layer * 70;
      const offset = (scroll * (0.08 + layer * 0.06)) % tileWidth;
      ctx.fillStyle = ["#263f43", "#1b3339", "#12262e"][layer];
      ctx.beginPath();
      ctx.moveTo(-tileWidth - offset, floor);
      for (let x = -tileWidth - offset; x <= w + tileWidth; x += tileWidth / 2) {
        const step = Math.round((x + offset) / (tileWidth / 2));
        const peak = baseY - ((step * 37 + layer * 19) % 47);
        ctx.lineTo(x, peak);
        ctx.lineTo(x + tileWidth / 4, baseY + 12);
      }
      ctx.lineTo(w + tileWidth, floor);
      ctx.closePath();
      ctx.fill();
    }

    ctx.fillStyle = "#182b2b";
    ctx.fillRect(0, floor - 8, w, h - floor + 8);
    ctx.fillStyle = "#738f4d";
    ctx.fillRect(0, floor - 8, w, 3);
    const groundOffset = (scroll * .7) % 90;
    for (let x = -groundOffset; x < w + 45; x += 90) {
      ctx.fillStyle = "#40573c";
      ctx.fillRect(x + 14, floor - 19, 3, 11);
      ctx.fillRect(x + 8, floor - 18, 14, 2);
      ctx.fillStyle = "#a2c96b";
      ctx.fillRect(x + 9, floor - 21, 5, 3);
      ctx.fillRect(x + 18, floor - 23, 5, 4);
    }
  }

  drawAlienCave(floor) {
    const ctx = this.ctx, w = this.width, h = this.height;
    const scroll = (this.elapsed * this.speed * .2) % 110;
    ctx.fillStyle = "#171923";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(w, 0);
    for (let x = w; x >= 0; x -= 30) {
      const depth = 18 + Math.sin((x + scroll) * .027) * 13 + Math.sin((x - scroll) * .061) * 7;
      ctx.lineTo(x, depth);
    }

    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#20232a";
    ctx.fillRect(0, floor - 10, w, h - floor + 10);
    ctx.fillStyle = "#626957";
    ctx.fillRect(0, floor - 12, w, 4);
    ctx.fillStyle = "#394039";
    ctx.fillRect(0, floor - 8, w, 7);
    for (let x = -scroll; x < w + 70; x += 70) {
      const ridge = 2 + Math.sin((x + scroll) * .1) * 2;
      ctx.fillStyle = "#343a35";
      ctx.fillRect(x, floor + ridge, 26, 3);
      ctx.fillStyle = "#485044";
      ctx.fillRect(x + 35, floor + 8, 17, 2);
    }
    ctx.fillStyle = "#272a31";
    ctx.fillRect(0, floor + 35, w, h - floor - 35);
    ctx.fillStyle = "#414740";
    for (let x = 20; x < w; x += 113) {
      const glowY = 45 + ((x * 17) % Math.max(60, Math.floor(floor - 95)));
      ctx.fillRect(x, glowY, 2, 10);
      ctx.fillRect(x - 3, glowY + 9, 8, 2);
    }
  }

  drawUndergroundCity(floor) {
    const ctx = this.ctx, w = this.width, h = this.height;
    const scroll = this.elapsed * this.speed * .32;
    const skyline = floor - Math.min(88, h * .2);
    const glow = ctx.createLinearGradient(0, skyline - 65, 0, floor);
    glow.addColorStop(0, "#142c3b00");
    glow.addColorStop(1, "#48b8be28");
    ctx.fillStyle = glow;
    ctx.fillRect(0, skyline - 65, w, floor - skyline + 65);

    for (let layer = 0; layer < 2; layer++) {
      const width = 95 + layer * 48;
      const offset = (scroll * (layer === 0 ? .16 : .31)) % width;
      const buildingColors = layer === 0
        ? ["#0a1720", "#0b1821", "#0c1922", "#0d1a23"]
        : ["#10212a", "#11222b", "#12232c", "#13242d"];
      const trimColors = layer === 0
        ? ["#172c35", "#182d36", "#192e37", "#1a2f38"]
        : ["#203a42", "#213b43", "#223c44", "#233d45"];
      for (let x = -width - offset; x < w + width; x += width) {
        const buildingIndex = Math.floor((x + offset) / width);
        const heightSeed = Math.sin((buildingIndex + layer * 23) * 127.1) * 43758.5453;
        const heightVariation = heightSeed - Math.floor(heightSeed);
        const shadeSeed = Math.sin((buildingIndex + layer * 37) * 91.7) * 24634.6345;
        const shadeIndex = Math.floor((shadeSeed - Math.floor(shadeSeed)) * buildingColors.length);
        const buildingHeight = h * (.2 + heightVariation * .38);
        const top = skyline - buildingHeight;
        ctx.fillStyle = buildingColors[shadeIndex];
        ctx.fillRect(x, top, width - 5, buildingHeight);
        ctx.fillStyle = trimColors[shadeIndex];
        ctx.fillRect(x + 5, top + 7, width - 15, 3);
        ctx.fillStyle = "#48aaa5";
        ctx.globalAlpha = .48 + Math.sin(this.elapsed * 2 + x * .03) * .18;
        for (let windowY = top + 21; windowY < skyline - 12; windowY += 19) {
          for (let windowX = x + 11; windowX < x + width - 15; windowX += 19) {
            if (Math.floor(windowX + windowY + layer) % 3 !== 0) {
              ctx.fillRect(windowX, windowY, 5, 8);
            }
          }
        }
        ctx.globalAlpha = 1;
      }
    }

    ctx.fillStyle = "#1b3038";
    ctx.fillRect(0, floor - 13, w, 15);
    ctx.fillStyle = "#56c7c2";
    ctx.fillRect(0, floor - 13, w, 3);
    ctx.fillStyle = "#14252e";
    ctx.fillRect(0, floor + 2, w, h - floor - 2);
    const laneOffset = scroll % 130;
    for (let x = -laneOffset; x < w + 130; x += 130) {
      ctx.fillStyle = "#28616a";
      ctx.fillRect(x, floor + 16, 52, 3);
      ctx.fillStyle = "#1a414d";
      ctx.fillRect(x + 5, floor + 28, 20, Math.max(0, h - floor - 28));
    }

    ctx.strokeStyle = "#4fc6c866";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, skyline + 9);
    ctx.lineTo(w, skyline + 9);
    ctx.stroke();
    for (let x = -((scroll * .72) % 85); x < w + 85; x += 85) {
      ctx.fillStyle = "#76efe0";
      ctx.fillRect(x, skyline + 6, 12, 4);
    }
  }

  draw(dt) {
    if (!this.width || !this.height) return;
    const ctx = this.ctx;
    ctx.save();
    if (this.shake > 0) ctx.translate((Math.random() - .5) * this.shake, (Math.random() - .5) * this.shake);
    this.drawBackground(dt);
    for (const particle of this.particles) particle.draw(ctx);
    for (const explosion of this.explosions) explosion.draw(ctx);
    for (const projectile of this.enemyProjectiles) projectile.draw(ctx);
    for (const projectile of this.projectiles) projectile.draw(ctx);
    for (const pickup of this.pickups) pickup.draw(ctx);
    for (const enemy of this.enemies) enemy.draw(ctx);
    this.player.draw(ctx);
    ctx.restore();
    if (this.state === "paused") {
      ctx.fillStyle = "#080b1480";
      ctx.fillRect(0, 0, this.width, this.height);
    }
  }
}

window.addEventListener("DOMContentLoaded", () => new Game(document.getElementById("game-canvas")));

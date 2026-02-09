const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;

// DOM stats elements
const scoreEl = document.getElementById('scoreEl');
const highScoreEl = document.getElementById('highScoreEl');
const timeEl = document.getElementById('timeEl');
const runsEl = document.getElementById('runsEl');
const totalTimeEl = document.getElementById('totalTimeEl');

// game state
let player, obstacles, frames, score, speed, running, gameOver;
let bullets = [];

// session & persistence
let sessionStart = null; // timestamp ms
let sessionElapsed = 0; // ms
let obstaclesDodged = 0;
let highScore = 0, runs = 0, totalPlayTime = 0;

const baseSpeed = 6;
const speedStep = 1; // speed increase per interval
const speedIncreaseInterval = 120000; // 2 minutes in ms
const cameraZ = 500; // camera distance for simple perspective projection

function loadStats(){
	highScore = parseInt(localStorage.getItem('dino_highscore') || '0', 10);
}

function loadMoreStats(){
	highScore = parseInt(localStorage.getItem('dino_highscore') || '0', 10);
 	// optional totals
 	runs = parseInt(localStorage.getItem('dino_runs') || '0', 10);
 	totalPlayTime = parseInt(localStorage.getItem('dino_totalPlayTime') || '0', 10);
}

function saveStats(){
 	localStorage.setItem('dino_highscore', String(highScore));
 	localStorage.setItem('dino_runs', String(runs));
 	localStorage.setItem('dino_totalPlayTime', String(totalPlayTime));
}

function formatMs(ms){
 	const s = Math.floor(ms/1000);
 	if(s < 60) return s + 's';
 	const m = Math.floor(s/60);
 	const rem = s % 60;
 	return m + 'm ' + rem + 's';
}

function updateStatsUI(){
 	if(scoreEl) scoreEl.textContent = Math.floor(score);
 	if(highScoreEl) highScoreEl.textContent = highScore;
 	if(timeEl) timeEl.textContent = formatMs(sessionElapsed);
 	if(runsEl) runsEl.textContent = runs;
 	if(totalTimeEl) totalTimeEl.textContent = formatMs(totalPlayTime);
}

function reset(){
 	frames = 0;
 	score = 0;
 	speed = baseSpeed;
 	gameOver = false;
 	running = false;
	player = { x: W/2 - 20, w:40, h:40, worldX:0, vx:0, worldY:0, grounded:true };
	obstacles = [];
	bullets = [];
 	sessionStart = null;
 	sessionElapsed = 0;
 	obstaclesDodged = 0;
 	updateStatsUI();
 	draw();
}

// For pseudo-3D: obstacles have world coordinates (z distance from camera)
function spawnObstacle(){
 	const h = 30 + Math.random()*50; // world height
 	const w = 20 + Math.random()*30; // world width
 	const worldX = (Math.random() - 0.5) * 300; // left/right offset in world coords
 	const z = 800 + Math.random()*600; // distance from camera
 	obstacles.push({ worldX, z, w, h });
}

function spawnBullet(worldX){
	const wX = (typeof worldX === 'number') ? worldX : player.worldX;
	bullets.push({ worldX: wX, z: 0, speed: 40 });
}

function endRun(){
 	// finalize stats
 	runs++;
 	const runMs = sessionElapsed || 0;
 	totalPlayTime += runMs;
 	if(Math.floor(score) > highScore) highScore = Math.floor(score);
 	saveStats();
 	updateStatsUI();
}

function update(){
 	if(gameOver) return;
 	frames++;
 	// start running after first jump or space
 	if(running){
 		if(!sessionStart) sessionStart = Date.now();
 		sessionElapsed = Date.now() - sessionStart;
 		// increase score
 		score += 0.06; // slightly faster score in 3D mode
 		// speed increases every 2 minutes
 		const increments = Math.floor(sessionElapsed / speedIncreaseInterval);
 		speed = baseSpeed + increments * speedStep;

 		// spawn obstacles based on a frame rhythm tuned by speed
 		if(frames % Math.max(20, 100 - Math.floor(score)) === 0) spawnObstacle();

 		// move obstacles along z towards camera
 		for(let i = obstacles.length-1; i>=0; i--){
 			const o = obstacles[i];
 			o.z -= speed * 6; // scale movement to feel right
 			if(o.z <= 10){
 				// obstacle passed the camera (dodged)
 				obstacles.splice(i,1);
 				obstaclesDodged++;
 			}
 		}

		// update bullets (bullets travel forward into scene; obstacles move toward camera)
		for(let bi = bullets.length-1; bi >= 0; bi--){
			const b = bullets[bi];
			b.z += b.speed; // move bullet forward
			// remove if too far
			if(b.z > 5000) bullets.splice(bi,1);
		}

		// bullet vs obstacle collisions
		for(let bi = bullets.length-1; bi >= 0; bi--){
			const b = bullets[bi];
			for(let oi = obstacles.length-1; oi >= 0; oi--){
				const o = obstacles[oi];
				const horizDist = Math.abs(b.worldX - o.worldX);
				// consider width in world coords (approx)
				const hitWidth = o.w * 0.6;
				const hitRangeZ = 80; // tolerance in z to hit
				if(horizDist < hitWidth && Math.abs(b.z - o.z) < hitRangeZ){
					// destroy obstacle and bullet
					obstacles.splice(oi,1);
					bullets.splice(bi,1);
					score += 1; // reward
					break;
				}
			}
		}
 	}

	// player lateral movement
	player.worldX += player.vx;
	// clamp to reasonable world bounds
	const limit = 380;
	if(player.worldX < -limit) player.worldX = -limit;
	if(player.worldX > limit) player.worldX = limit;

 	// collision: project obstacle rects and player rect and test overlap
	for(const o of obstacles){
 		// simple projection
 		const cameraZ = 500;
 		const scale = cameraZ / (cameraZ + o.z);
 		const projW = o.w * scale;
 		const projH = o.h * scale;
 		const screenX = W/2 + o.worldX * scale - projW/2;
 		const screenY = H - projH - 10; // ground-aligned

		// player projection (player at z ~ 0), use worldX for lateral position
		const pScale = cameraZ / (cameraZ + 0);
		const pW = player.w * pScale;
		const pH = player.h * pScale;
		const pX = W/2 + player.worldX - pW/2;
		const pY = H - pH - 10 - player.worldY;

 		// horizontal overlap
 		const hor = pX < screenX + projW && pX + pW > screenX;
 		// vertical overlap: obstacle occupies ground up to projH; if player's bottom is lower than obstacle top => collision
 		const vert = pY + pH > screenY;

 		if(hor && vert && o.z < 300){ // only collide when obstacle is near enough
 			gameOver = true;
 			endRun();
 		}
 	}

 	updateStatsUI();
}

function draw(){
	// clear (dark cyberpunk sky)
	ctx.fillStyle = '#071227';
	ctx.fillRect(0,0,W,H);

	// perspective ground grid
	ctx.strokeStyle = 'rgba(0,255,200,0.06)';
	ctx.lineWidth = 1;
	const horizonY = H/2 + 10;
	for(let i=1;i<10;i++){
		const y = horizonY + i * 12;
		ctx.beginPath();
		ctx.moveTo(0, y);
		ctx.lineTo(W, y);
		ctx.stroke();
	}

	// ground strip
	ctx.fillStyle = '#0f1630';
	ctx.fillRect(0, H-10, W, 10);
	ctx.fillStyle = 'rgba(0,255,200,0.06)';
	ctx.fillRect(0, H-14, W, 4);

	// draw obstacles with perspective projection
	for(const o of obstacles){
		const scale = cameraZ / (cameraZ + o.z);
		const projW = o.w * scale;
		const projH = o.h * scale;
		const screenX = W/2 + o.worldX * scale - projW/2;
		const screenY = H - projH - 10; // aligned to ground

		// neon glow
		ctx.fillStyle = 'rgba(57,255,20,0.08)';
		ctx.fillRect(screenX-4, screenY-4, projW+8, projH+8);
		ctx.fillStyle = '#39ff14';
		ctx.fillRect(screenX, screenY, projW, projH);
	}

	// draw bullets (small neon shots)
	for(const b of bullets){
		const scale = cameraZ / (cameraZ + b.z);
		const bx = W/2 + b.worldX * scale;
		const by = H - 18 - 4*scale; // in front of ground
		const size = Math.max(4, 6 * scale);
		ctx.fillStyle = 'rgba(0,255,240,0.9)';
		ctx.beginPath();
		ctx.arc(bx, by, size, 0, Math.PI*2);
		ctx.fill();
	}

	// player (near camera)
	const pW = player.w;
	const pH = player.h;
	const pX = W/2 + player.worldX - pW/2;
	const pY = H - pH - 10 - player.worldY;
	// player glow
	ctx.fillStyle = 'rgba(255,45,149,0.12)';
	ctx.fillRect(pX-6, pY-6, pW+12, pH+12);
	ctx.fillStyle = '#ff2d95';
	ctx.fillRect(pX, pY, pW, pH);

	// score and speed
	ctx.fillStyle = '#e6f1ff';
	ctx.font = '16px Arial';
	ctx.fillText('Score: ' + Math.floor(score), 10, 20);
	ctx.fillText('Speed: ' + speed, W - 130, 20);

 	// game over overlay
 	if(gameOver){
 		ctx.fillStyle = 'rgba(0,0,0,0.6)';
 		ctx.fillRect(0,0,W,H);
 		ctx.fillStyle = '#e6f1ff';
 		ctx.font = '28px Arial';
 		ctx.textAlign = 'center';
 		ctx.fillText('Game Over', W/2, H/2 - 10);
 		ctx.font = '16px Arial';
		ctx.fillText('กด Space/Enter หรือคลิกเพื่อเริ่มใหม่', W/2, H/2 + 20);
 		ctx.textAlign = 'start';
 	}
}

function loop(){
 	update();
 	draw();
 	if(!gameOver) requestAnimationFrame(loop);
}

// Input: left/right movement (ArrowLeft/ArrowRight or A/D)
const keys = { left: false, right: false };
document.addEventListener('keydown', e => {
	// allow restart with Space/Enter
	if((e.code === 'Space' || e.code === 'Enter') && gameOver){ reset(); running = true; loop(); return; }
	if(e.code === 'ArrowLeft' || e.key === 'a' || e.key === 'A'){
		keys.left = true; player.vx = -8;
		if(!running){ running = true; if(frames === 0) loop(); }
	} else if(e.code === 'ArrowRight' || e.key === 'd' || e.key === 'D'){
		keys.right = true; player.vx = 8;
		if(!running){ running = true; if(frames === 0) loop(); }
	}
});

document.addEventListener('keyup', e => {
	if(e.code === 'ArrowLeft' || e.key === 'a' || e.key === 'A'){
		keys.left = false;
		if(!keys.right) player.vx = 0; else player.vx = 8;
	} else if(e.code === 'ArrowRight' || e.key === 'd' || e.key === 'D'){
		keys.right = false;
		if(!keys.left) player.vx = 0; else player.vx = -8;
	}
});

// Mouse: click left/right half to move; release to stop
canvas.addEventListener('mousedown', (ev) => {
	const rect = canvas.getBoundingClientRect();
	const x = ev.clientX - rect.left;
	if(gameOver){ reset(); running = true; loop(); return; }
	if(x < W/2){ player.vx = -8; keys.left = true; }
	else { player.vx = 8; keys.right = true; }
	if(!running){ running = true; if(frames === 0) loop(); }
});
canvas.addEventListener('mouseup', () => { player.vx = 0; keys.left = keys.right = false; });

// Right-click to shoot: prevent context menu
canvas.addEventListener('contextmenu', (ev) => {
	ev.preventDefault();
	const rect = canvas.getBoundingClientRect();
	const x = ev.clientX - rect.left;
	// optional: aim by clicking left/right half; here we spawn from current player.worldX
	if(gameOver){ reset(); running = true; loop(); return; }
	spawnBullet();
	if(!running){ running = true; if(frames === 0) loop(); }
	return false;
});

// initial
loadMoreStats();
reset();
draw();

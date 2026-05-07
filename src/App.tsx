import { useState, useEffect, useRef, useCallback } from 'react';

type GameState = 'start' | 'playing' | 'gameover';
type SongType = 'mainmenu' | 'normal' | 'fever' | 'none';

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<GameState>('start');
  const [hasStartedJumping, setHasStartedJumping] = useState(false);
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(1);
  const [lives, setLives] = useState(3);
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [showLevelUp, setShowLevelUp] = useState(false);
  const [selectedCharacter, setSelectedCharacter] = useState<'comi' | 'comma'>('comi');

  // For fullscreen canvas
  const [dimensions, setDimensions] = useState({ width: window.innerWidth, height: window.innerHeight });

  const gameImageRef = useRef<HTMLImageElement | null>(null);
  const animationIdRef = useRef<number>(0);
  
  // Audio refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const currentSongRef = useRef<SongType>('none');
  const mainMenuBgmRef = useRef<HTMLAudioElement | null>(null);
  const gameBgmRef = useRef<HTMLAudioElement | null>(null);
  const feverBgmRef = useRef<HTMLAudioElement | null>(null);

  const physicsRef = useRef({
    lastTime: 0,
    pipeSpawnTimer: 0,
    bird: { x: 80, y: window.innerHeight / 2, velocity: 0, gravity: 1800, jump: -500, width: 48, height: 48, hitbox: 24 },
    pipes: [] as Array<{x: number, topHeight: number, bottomY: number, bottomHeight: number, width: number, passed: boolean}>,
    bgScroll: 0,
    score: 0,
    level: 1,
    isFever: false,
    feverTimer: 0,
    nextFeverScore: 7, // Initial fever score
    invincibleTimer: 0,
    lives: 3
  });

  const gameStateRef = useRef(gameState);
  const hasStartedJumpingRef = useRef(hasStartedJumping);
  const livesRef = useRef(lives);
  
  useEffect(() => { gameStateRef.current = gameState; }, [gameState]);
  useEffect(() => { hasStartedJumpingRef.current = hasStartedJumping; }, [hasStartedJumping]);
  useEffect(() => { livesRef.current = lives; }, [lives]);

  // Handle Level Up Notification
  useEffect(() => {
    if (level > 1) {
      setShowLevelUp(true);
      const timer = setTimeout(() => setShowLevelUp(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [level]);

  // Handle resize
  useEffect(() => {
    let timeoutId: number;
    const handleResize = () => {
      clearTimeout(timeoutId);
      // Add a small delay to allow mobile browsers to update innerHeight after address bar changes
      timeoutId = window.setTimeout(() => {
        setDimensions({ width: window.innerWidth, height: window.innerHeight });
      }, 100);
    };
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
      clearTimeout(timeoutId);
    };
  }, []);

  // Load the hardcoded image
  useEffect(() => {
    const img = new Image();
    img.src = `${selectedCharacter}.png`;
    img.onload = () => { gameImageRef.current = img; };
    img.onerror = () => { gameImageRef.current = null; };
  }, [selectedCharacter]);

  const updateBGMSpeed = useCallback(() => {
    const currentLevel = physicsRef.current.level;
    // Base speed at level 1 is 1.0, increases by 0.05 per level, capped at 1.5
    const speed = Math.min(1.5, 1.0 + (currentLevel - 1) * 0.05);
    
    [mainMenuBgmRef.current, gameBgmRef.current, feverBgmRef.current].forEach(audio => {
      if (audio) {
        audio.playbackRate = speed;
      }
    });
  }, []);

  const playBGM = useCallback((type: SongType) => {
    let targetAudio: HTMLAudioElement | null = null;
    if (type === 'mainmenu') targetAudio = mainMenuBgmRef.current;
    else if (type === 'normal') targetAudio = gameBgmRef.current;
    else if (type === 'fever') targetAudio = feverBgmRef.current;

    // If already playing this type and not paused, do nothing
    if (currentSongRef.current === type && targetAudio && !targetAudio.paused) return;
    
    // Stop all other BGMs
    [mainMenuBgmRef.current, gameBgmRef.current, feverBgmRef.current].forEach(audio => {
      if (audio && audio !== targetAudio) {
        audio.pause();
        audio.currentTime = 0;
        audio.volume = 1.0; 
      }
    });

    currentSongRef.current = type;
    if (type === 'none') return;

    if (targetAudio) {
      updateBGMSpeed(); // Apply current speed before playing
      targetAudio.volume = 1.0;
      targetAudio.play().catch(e => console.log("Audio play failed:", e));
    }
  }, [updateBGMSpeed]);

  // Preload and setup BGMs
  useEffect(() => {
    mainMenuBgmRef.current = new Audio('mainmenu.mp3');
    mainMenuBgmRef.current.loop = true;
    gameBgmRef.current = new Audio('game.mp3');
    gameBgmRef.current.loop = true;
    feverBgmRef.current = new Audio('fever.mp3');
    feverBgmRef.current.loop = true;

    // Attempt to auto-play on mount (may be blocked by browser)
    if (gameStateRef.current === 'start') {
      playBGM('mainmenu');
    }

    return () => {
      [mainMenuBgmRef.current, gameBgmRef.current, feverBgmRef.current].forEach(audio => {
        if (audio) {
          audio.pause();
          audio.src = '';
        }
      });
    };
  }, [playBGM]);

  const fadeBGM = useCallback((target: number, duration: number) => {
    const audios = [mainMenuBgmRef.current, gameBgmRef.current, feverBgmRef.current];
    const playingAudio = audios.find(a => a && !a.paused);
    if (!playingAudio) return;

    const startVol = playingAudio.volume;
    const startTime = performance.now();
    
    const interval = setInterval(() => {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      playingAudio.volume = startVol + (target - startVol) * progress;
      if (progress === 1) clearInterval(interval);
    }, 16);
  }, []);

  const duckBGM = useCallback(() => {
    // Smoothly duck volume to 0.2 over 200ms, wait 600ms, then fade back over 300ms
    fadeBGM(0.2, 200);
    setTimeout(() => {
      fadeBGM(1.0, 300);
    }, 800);
  }, [fadeBGM]);

  // --- Audio System ---
  const initAudio = useCallback(() => {
    if (!audioCtxRef.current) {
      const AudioContextClass = (window.AudioContext || (window as any).webkitAudioContext);
      audioCtxRef.current = new AudioContextClass();
    }
    
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }

    // Create and play a tiny silent buffer to "unlock" audio on mobile
    const ctx = audioCtxRef.current;
    const buffer = ctx.createBuffer(1, 1, 22050);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0);

    // Start main menu BGM if we're at the start screen
    if (gameStateRef.current === 'start') {
      playBGM('mainmenu');
    }
  }, [playBGM]);

  // Global interaction listener to "unlock" audio
  useEffect(() => {
    const unlockAudio = () => {
      initAudio();
      // Also explicitly try to play main menu BGM if we're on start screen
      if (gameStateRef.current === 'start') {
        playBGM('mainmenu');
      }
      window.removeEventListener('mousedown', unlockAudio);
      window.removeEventListener('touchstart', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
      window.removeEventListener('pointerdown', unlockAudio);
    };
    window.addEventListener('mousedown', unlockAudio);
    window.addEventListener('touchstart', unlockAudio);
    window.addEventListener('keydown', unlockAudio);
    window.addEventListener('pointerdown', unlockAudio);
    return () => {
      window.removeEventListener('mousedown', unlockAudio);
      window.removeEventListener('touchstart', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
      window.removeEventListener('pointerdown', unlockAudio);
    };
  }, [initAudio, playBGM]);

  const playSound = useCallback((type: 'jump' | 'crash' | 'fever_enter' | 'levelup') => {
    if (!audioCtxRef.current) return;
    const ctx = audioCtxRef.current;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'jump') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(400, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
      osc.start();
      osc.stop(ctx.currentTime + 0.1);
    } else if (type === 'crash') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(300, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.3);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } else if (type === 'fever_enter') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.5);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.5);
      osc.start();
      osc.stop(ctx.currentTime + 0.5);
    } else if (type === 'levelup') {
      // Arpeggio sound for level up
      const now = ctx.currentTime;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(523.25, now); // C5
      osc.frequency.setValueAtTime(659.25, now + 0.1); // E5
      osc.frequency.setValueAtTime(783.99, now + 0.2); // G5
      osc.frequency.setValueAtTime(1046.50, now + 0.3); // C6
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.linearRampToValueAtTime(0, now + 0.5);
      osc.start();
      osc.stop(now + 0.5);
    }
  }, []);

  const gameOver = useCallback(() => {
    setGameState('gameover');
    gameStateRef.current = 'gameover';
    playBGM('none');
    playSound('crash');
  }, [playBGM, playSound]);

  const update = useCallback((dt: number) => {
    const state = physicsRef.current;
    const cw = dimensions.width;
    const ch = dimensions.height;
    
    // Difficulty Scaling based on score is now handled in the score setter
    // to prevent race conditions.

    // Fever Logic (Dynamic random intervals)
    if (state.score > 0 && state.score >= state.nextFeverScore && !state.isFever) {
      state.isFever = true;
      state.feverTimer = 12; // Fixed long duration (12 seconds)
      playSound('fever_enter');
      playBGM('fever');
    }

    if (state.isFever) {
      state.feverTimer -= dt;
      if (state.feverTimer <= 0) {
        state.isFever = false;
        // Set next fever score ONLY when current fever ends
        state.nextFeverScore = state.score + Math.floor(Math.random() * 5) + 5; // More frequent (every 5-10 pts)
        // Reset BGM to normal but with updated speed
        currentSongRef.current = 'none'; 
        playBGM('normal');
        
        // Give 1 second of invincibility after fever ends to prevent instant death
        state.invincibleTimer = 1.0;
      }
    }

    if (state.invincibleTimer > 0) {
      state.invincibleTimer -= dt;
    }

    // Calculate dynamic difficulty parameters (Rebalanced for shorter, more intense play)
    const effectiveLevel = Math.min(state.level, 30); 
    const speedMultiplier = state.isFever ? 2.5 : 1; // High booster effect in fever
    const currentPipeSpeed = (220 + (effectiveLevel * 25)) * speedMultiplier; // Faster base and scaling
    const currentPipeGap = Math.max(140, 240 - (effectiveLevel * 6)); // Tighter gaps
    
    // Distance between pipes
    const pipeDistance = Math.max(350, 600 - (effectiveLevel * 12)); 
    const currentSpawnInterval = pipeDistance / currentPipeSpeed;

    // Background scroll (Booster effect for scroll speed too)
    state.bgScroll = (state.bgScroll + (state.isFever ? 1000 : 80) * dt) % cw;

    if (!hasStartedJumpingRef.current) {
      state.bird.y = ch / 2 + Math.sin(performance.now() / 200) * 10;
      return;
    }

    state.bird.velocity += state.bird.gravity * dt;
    state.bird.y += state.bird.velocity * dt;

    // Ceiling bounce
    if (state.bird.y + state.bird.height / 2 - state.bird.hitbox / 2 < 0) {
      state.bird.y = state.bird.hitbox / 2 - state.bird.height / 2;
      state.bird.velocity = 200;
    }

    state.pipeSpawnTimer += dt;
    if (state.pipeSpawnTimer >= currentSpawnInterval) {
      state.pipeSpawnTimer = 0;
      const minPipeHeight = 60;
      const maxPipeHeight = Math.max(minPipeHeight, ch - currentPipeGap - minPipeHeight - 50); // 50 for floor
      
      let topHeight;
      if (state.pipes.length > 0) {
        // Limit how drastically the pipe height can change to ensure it's always passable
        const lastPipe = state.pipes[state.pipes.length - 1];
        // Vertical change gets more extreme at high levels to require sharp reflexes
        const maxChange = Math.min(240, 120 + (state.level * 5)); 
        const minTop = Math.max(minPipeHeight, lastPipe.topHeight - maxChange);
        const maxTop = Math.min(maxPipeHeight, lastPipe.topHeight + maxChange);
        topHeight = Math.floor(Math.random() * (maxTop - minTop + 1)) + minTop;
      } else {
        topHeight = Math.floor(Math.random() * (maxPipeHeight - minPipeHeight + 1)) + minPipeHeight;
      }

      state.pipes.push({
        x: cw,
        width: 64,
        topHeight: topHeight,
        bottomY: topHeight + currentPipeGap,
        bottomHeight: ch - (topHeight + currentPipeGap),
        passed: false
      });
    }

    for (let i = state.pipes.length - 1; i >= 0; i--) {
      const p = state.pipes[i];
      p.x -= currentPipeSpeed * dt;

      const birdCenterX = state.bird.x + state.bird.width / 2;
      const birdCenterY = state.bird.y + state.bird.height / 2;
      const halfHitbox = state.bird.hitbox / 2;

      const hitTop = birdCenterX + halfHitbox > p.x && 
                     birdCenterX - halfHitbox < p.x + p.width && 
                     birdCenterY - halfHitbox < p.topHeight;
                     
      const hitBottom = birdCenterX + halfHitbox > p.x && 
                        birdCenterX - halfHitbox < p.x + p.width && 
                        birdCenterY + halfHitbox > p.bottomY;

      // Collision handling
      if (!state.isFever && state.invincibleTimer <= 0 && (hitTop || hitBottom)) {
        if (state.lives > 1) {
          state.lives -= 1;
          setLives(state.lives);
          state.invincibleTimer = 1.5; // 1.5s invincibility after hit
          playSound('crash');
        } else {
          state.lives = 0;
          setLives(0);
          gameOver();
        }
      }

      if (p.x + p.width < state.bird.x && !p.passed) {
        // Increment score in physics state synchronously
        state.score += 1;
        
        // Structured Level Progression (Fast-paced):
        // Level 1: 0-4 (5 pts)
        // Level 2: 5-11 (7 pts)
        // Level 3: 12-21 (10 pts)
        // Level 4: 22-34 (13 pts)
        // Level 5+: score >= 35, increases every 15 pts
        let newLevel = 1;
        if (state.score >= 35) {
          newLevel = 5 + Math.floor((state.score - 35) / 15);
        } else if (state.score >= 22) {
          newLevel = 4;
        } else if (state.score >= 12) {
          newLevel = 3;
        } else if (state.score >= 5) {
          newLevel = 2;
        }

        if (newLevel !== state.level) {
          state.level = newLevel;
          setLevel(newLevel);
          duckBGM(); // Now uses smooth fade logic internally
          playSound('levelup');
          updateBGMSpeed();
        }        
        // Update UI score
        setScore(state.score);
        p.passed = true;
      }

      if (p.x + p.width < 0) {
        state.pipes.splice(i, 1);
      }
    }

    // Floor collision
    if (state.bird.y + state.bird.height / 2 + state.bird.hitbox / 2 > ch - 50) {
      if (!state.isFever && state.invincibleTimer <= 0) {
        if (state.lives > 1) {
          state.lives -= 1;
          setLives(state.lives);
          state.invincibleTimer = 1.5;
          state.bird.velocity = -400; // Bounce up
          playSound('crash');
        } else {
          state.lives = 0;
          setLives(0);
          gameOver();
        }
      } else {
        // Bounce up if invincible
        state.bird.y = ch - 50 - state.bird.hitbox / 2 - state.bird.height / 2;
        state.bird.velocity = -400;
      }
    }
  }, [gameOver, playBGM, playSound, duckBGM, updateBGMSpeed, dimensions]);

  const drawCloud = useCallback((ctx: CanvasRenderingContext2D, x: number, y: number, scale: number) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.beginPath();
    ctx.arc(0, 0, 20, Math.PI * 0.5, Math.PI * 1.5);
    ctx.arc(25, -15, 25, Math.PI * 1, Math.PI * 2);
    ctx.arc(55, -10, 20, Math.PI * 1, Math.PI * 2);
    ctx.arc(70, 0, 20, Math.PI * 1.5, Math.PI * 0.5);
    ctx.fill();
    ctx.restore();
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const state = physicsRef.current;
    const gameImage = gameImageRef.current;
    const cw = dimensions.width;
    const ch = dimensions.height;

    // 1. Background
    if (state.isFever) {
      // Fever Rainbow Background
      const hue = (performance.now() / 5) % 360;
      const skyGrad = ctx.createLinearGradient(0, 0, 0, ch);
      skyGrad.addColorStop(0, `hsl(${hue}, 80%, 70%)`);
      skyGrad.addColorStop(1, `hsl(${(hue + 60) % 360}, 80%, 80%)`);
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, cw, ch);
      
      // Speed lines (Faster and more intense booster feel)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.lineWidth = 3;
      const lineCount = 15;
      const time = performance.now() * 0.01;
      for(let i=0; i<lineCount; i++) {
        const y = ((i * (ch / lineCount)) + (time * 100)) % ch;
        const length = 100 + Math.random() * 200;
        ctx.beginPath();
        ctx.moveTo(cw, y);
        ctx.lineTo(cw - length, y);
        ctx.stroke();
      }
    } else {
      // Normal Sky
      const skyGrad = ctx.createLinearGradient(0, 0, 0, ch);
      skyGrad.addColorStop(0, '#bae6fd');
      skyGrad.addColorStop(1, '#e0f2fe');
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, cw, ch);
    }

    // 2. Clouds
    const cloudScroll = state.bgScroll * 0.5;
    for (let i = 0; i < Math.ceil(cw / 200) + 1; i++) {
      drawCloud(ctx, (i * 200) + 50 - (cloudScroll % 200), 100, 1);
      drawCloud(ctx, (i * 250) + 250 - (cloudScroll * 0.8 % 250), 150, 0.8);
    }

    // 3. Pipes
    state.pipes.forEach(p => {
      ctx.fillStyle = state.isFever ? '#fcd34d' : '#a3e635'; // Golden pipes in fever
      ctx.strokeStyle = state.isFever ? '#b45309' : '#4d7c0f';
      ctx.lineWidth = 3;

      ctx.beginPath(); ctx.roundRect(p.x, -10, p.width, p.topHeight + 10, [0, 0, 8, 8]); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.roundRect(p.x - 4, p.topHeight - 20, p.width + 8, 20, [4, 4, 4, 4]); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.roundRect(p.x, p.bottomY, p.width, p.bottomHeight + 10, [8, 8, 0, 0]); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.roundRect(p.x - 4, p.bottomY, p.width + 8, 20, [4, 4, 4, 4]); ctx.fill(); ctx.stroke();
    });

    // 4. Ground
    const groundScroll = state.bgScroll;
    const groundY = ch - 50;
    ctx.fillStyle = state.isFever ? '#f472b6' : '#86efac';
    ctx.fillRect(0, groundY, cw, 50);
    ctx.fillStyle = state.isFever ? '#db2777' : '#22c55e';
    for (let i = 0; i < Math.ceil(cw / 30) + 1; i++) {
      ctx.fillRect((i * 30 - groundScroll) % cw, groundY, 15, 10);
      ctx.fillRect(((i * 30 - groundScroll) % cw) + cw, groundY, 15, 10);
    }
    ctx.strokeStyle = state.isFever ? '#831843' : '#166534';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(0, groundY); ctx.lineTo(cw, groundY); ctx.stroke();

    // 5. Bird
    // Booster Trail (Ghost effect during Fever)
    if (state.isFever) {
      for (let i = 1; i <= 3; i++) {
        ctx.save();
        const trailX = state.bird.x + state.bird.width / 2 - (i * 20);
        ctx.translate(trailX, state.bird.y + state.bird.height / 2);
        ctx.globalAlpha = 0.4 - (i * 0.1);
        
        let trailRotation = 0;
        if (hasStartedJumpingRef.current) {
          trailRotation = Math.min(Math.PI / 4, Math.max(-Math.PI / 4, (state.bird.velocity * 0.0012)));
        }
        ctx.rotate(trailRotation);

        if (gameImage && gameImage.complete && gameImage.naturalWidth > 0) {
          ctx.drawImage(gameImage, 0, 0, gameImage.width, gameImage.height, -state.bird.width / 2, -state.bird.height / 2, state.bird.width, state.bird.height);
        }
        ctx.restore();
      }
    }

    ctx.save();
    ctx.translate(state.bird.x + state.bird.width / 2, state.bird.y + state.bird.height / 2);
    
    // Blinking effect if invincible
    if (state.invincibleTimer > 0 && Math.floor(performance.now() / 100) % 2 === 0) {
      ctx.globalAlpha = 0.3;
    }

    let rotation = 0;
    if (hasStartedJumpingRef.current) {
      rotation = Math.min(Math.PI / 4, Math.max(-Math.PI / 4, (state.bird.velocity * 0.0012)));
    }
    ctx.rotate(rotation);

    if (gameImage && gameImage.complete && gameImage.naturalWidth > 0) {
      ctx.drawImage(gameImage, 0, 0, gameImage.width, gameImage.height, -state.bird.width / 2, -state.bird.height / 2, state.bird.width, state.bird.height);
    } else {
      ctx.fillStyle = '#60A5FA';
      ctx.beginPath(); ctx.arc(0, 0, state.bird.width/2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'white'; ctx.beginPath(); ctx.arc(8, -6, 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'black'; ctx.beginPath(); ctx.arc(10, -6, 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#FBBF24'; ctx.beginPath(); ctx.moveTo(12, 2); ctx.lineTo(26, 6); ctx.lineTo(12, 10); ctx.fill();
    }
    
    // Fever Aura
    if (state.isFever) {
      ctx.shadowBlur = 15;
      ctx.shadowColor = 'white';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, 0, state.bird.width/2 + 8 + Math.sin(performance.now()/50)*4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
    ctx.restore();

  }, [drawCloud]);

  const gameLoop = useCallback((timestamp: number) => {
    if (gameStateRef.current !== 'playing') return;

    const state = physicsRef.current;
    const dt = Math.min((timestamp - state.lastTime) / 1000, 0.1);
    state.lastTime = timestamp;

    update(dt);
    draw();

    animationIdRef.current = requestAnimationFrame(gameLoop);
  }, [update, draw]);

  const startGame = useCallback(() => {
    initAudio();
    setGameState('playing');
    gameStateRef.current = 'playing';
    setHasStartedJumping(false);
    hasStartedJumpingRef.current = false;
    setScore(0);
    setLevel(1);
    setLives(3);
    
    const state = physicsRef.current;
    state.score = 0;
    state.bird.y = dimensions.height / 2;
    state.bird.velocity = 0;
    state.pipes = [];
    state.pipeSpawnTimer = 0;
    state.level = 1;
    state.isFever = false;
    state.feverTimer = 0;
    state.nextFeverScore = 7;
    state.invincibleTimer = 0;
    state.lives = 3;
    state.lastTime = performance.now();

    // Start BGM immediately on user click for better mobile compatibility
    currentSongRef.current = 'none'; // Force refresh current song state
    playBGM('normal');

    if (animationIdRef.current) cancelAnimationFrame(animationIdRef.current);
    animationIdRef.current = requestAnimationFrame(gameLoop);
  }, [gameLoop, initAudio, playBGM, dimensions]);

  const goToMain = useCallback(() => {
    setGameState('start');
    gameStateRef.current = 'start';
    playBGM('mainmenu'); // Switch to main menu music
    
    // Reset physics bird position for the start screen bounce
    const state = physicsRef.current;
    state.bird.y = dimensions.height / 2;
    state.bird.velocity = 0;
  }, [dimensions.height, playBGM]);

  const jump = useCallback(() => {
    if (gameStateRef.current === 'playing') {
      initAudio();
      if (!hasStartedJumpingRef.current) {
        setHasStartedJumping(true);
        hasStartedJumpingRef.current = true;
        // BGM is already started in startGame
      }
      physicsRef.current.bird.velocity = physicsRef.current.bird.jump;
      playSound('jump');
    }
  }, [initAudio, playSound]);

  useEffect(() => {
    if (gameState === 'start') draw();
  }, [draw, gameState]);

  useEffect(() => {
    const handleSpace = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        jump();
      }
    };
    window.addEventListener('keydown', handleSpace);
    return () => window.removeEventListener('keydown', handleSpace);
  }, [jump]);

  return (
    <div className="fixed top-0 left-0 w-full h-[100dvh] bg-sky-50 overflow-hidden font-sans text-neutral-800 selection:bg-blue-500/30 touch-none">
      <canvas 
        ref={canvasRef} 
        width={dimensions.width} 
        height={dimensions.height}
        className="w-full h-full block cursor-pointer"
        onPointerDown={jump}
      />

      {/* Start Screen */}
      {gameState === 'start' && (
        <div 
          className="absolute inset-0 flex flex-col items-center justify-center p-4 md:p-6 text-center z-10 bg-cover bg-[center_top] md:bg-center bg-no-repeat transition-all"
          style={{ backgroundImage: "linear-gradient(rgba(255, 255, 255, 0.3), rgba(255, 255, 255, 0.6)), url('background.png')" }}
        >
          <div className="w-20 h-20 md:w-24 md:h-24 bg-sky-100/90 backdrop-blur-sm rounded-full flex items-center justify-center mb-3 md:mb-4 animate-bounce shadow-xl border-4 border-white shrink-0">
            <span className="text-5xl md:text-6xl">🚀</span>
          </div>
          <h1 className="text-5xl sm:text-6xl md:text-8xl font-black mb-1 text-transparent bg-clip-text bg-gradient-to-b from-sky-400 to-blue-600 tracking-tighter drop-shadow-md leading-none">
            SCNU COMA
          </h1>
          <div className="mb-4 md:mb-6">
            <span className="text-xs md:text-base font-black tracking-[0.2em] md:tracking-[0.3em] text-transparent bg-clip-text bg-gradient-to-r from-purple-500 to-pink-500 uppercase drop-shadow-sm">
              Made by 규성
            </span>
          </div>

          {/* Character Selection */}
          <div className="mb-6 md:mb-8 w-full max-w-[300px] md:max-w-[320px]">
            <p className="text-sky-600 font-black mb-3 text-xs md:text-sm tracking-widest bg-white/40 backdrop-blur-sm py-1 rounded-full inline-block px-4">캐릭터 선택</p>
            <div className="flex justify-center gap-3 md:gap-4">
              <button
                onClick={() => setSelectedCharacter('comi')}
                className={`relative flex flex-col items-center p-2 md:p-3 rounded-2xl transition-all active:scale-95 ${selectedCharacter === 'comi' ? 'bg-white shadow-[0_0_0_4px_#3b82f6] scale-105 md:scale-110 z-10' : 'bg-white/60 hover:bg-white/80 scale-100 opacity-80'}`}
              >
                <img src="comi.png" alt="코미" className="w-14 h-14 md:w-16 md:h-16 object-contain mb-1 md:mb-2 drop-shadow-md" />
                <span className={`font-black text-xs md:text-sm ${selectedCharacter === 'comi' ? 'text-blue-600' : 'text-neutral-500'}`}>코미</span>
              </button>
              <button
                onClick={() => setSelectedCharacter('comma')}
                className={`relative flex flex-col items-center p-2 md:p-3 rounded-2xl transition-all active:scale-95 ${selectedCharacter === 'comma' ? 'bg-white shadow-[0_0_0_4px_#3b82f6] scale-105 md:scale-110 z-10' : 'bg-white/60 hover:bg-white/80 scale-100 opacity-80'}`}
              >
                <img src="comma.png" alt="콤마" className="w-14 h-14 md:w-16 md:h-16 object-contain mb-1 md:mb-2 drop-shadow-md" />
                <span className={`font-black text-xs md:text-sm ${selectedCharacter === 'comma' ? 'text-blue-600' : 'text-neutral-500'}`}>콤마</span>
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-3 md:gap-4 w-full max-w-[260px] md:max-w-xs">
            <button onClick={startGame} className="bg-gradient-to-b from-blue-400 to-blue-600 text-white font-black text-lg md:text-2xl py-3.5 md:py-4 px-8 rounded-full cursor-pointer transition-all shadow-[0_6px_0_#1d4ed8] hover:translate-y-1 hover:shadow-[0_3px_0_#1d4ed8] active:translate-y-2 active:shadow-none w-full">
              게임 시작
            </button>
            <button onClick={() => setShowHowToPlay(true)} className="bg-white/80 backdrop-blur-sm text-blue-500 border-2 border-blue-100 font-black text-lg md:text-2xl py-3.5 md:py-4 px-8 rounded-full cursor-pointer transition-all shadow-[0_6px_0_#dbeafe] hover:translate-y-1 hover:shadow-[0_3px_0_#dbeafe] active:translate-y-2 active:shadow-none w-full">
              게임 방법
            </button>
          </div>
        </div>
      )}

      {/* How to Play Modal */}
      {showHowToPlay && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-md flex flex-col items-center justify-center p-6 z-50">
          <div className="bg-white rounded-3xl p-6 md:p-8 w-full max-w-sm shadow-2xl border-4 border-sky-100 relative transform transition-all">
            <h2 className="text-2xl md:text-3xl font-black text-blue-600 mb-5 text-center">게임 방법</h2>
            <ul className="text-neutral-600 space-y-4 font-bold text-sm md:text-base">
              <li className="flex items-center gap-3"><span className="text-2xl">👆</span> <span>화면 터치나 스페이스바로 <span className="text-blue-500">점프!</span></span></li>
              <li className="flex items-center gap-3"><span className="text-2xl">🧱</span> <span>다가오는 <span className="text-green-500">파이프</span>를 피하세요.</span></li>
              <li className="flex items-center gap-3"><span className="text-2xl">📈</span> <span>빠른 점수 획득으로 <span className="text-blue-500">레벨업!</span> (속도 증가)</span></li>
              <li className="flex items-center gap-3"><span className="text-2xl">🔥</span> <span>12초간의 <span className="text-red-500">피버 타임!</span> (무적 & 초고속 부스터)</span></li>
              <li className="flex items-center gap-3"><span className="text-2xl">❤️</span> <span>부딪히면 <span className="text-pink-500">하트</span>가 깎입니다. (총 3개)</span></li>
            </ul>
            <button onClick={() => setShowHowToPlay(false)} className="mt-8 w-full bg-neutral-100 text-neutral-600 hover:bg-neutral-200 font-black py-4 rounded-xl transition-colors text-lg">
              닫기
            </button>
          </div>
        </div>
      )}

      {/* Playing UI */}
      {gameState === 'playing' && (
        <>
          <div className="absolute top-6 left-6 z-10 flex flex-col gap-2">
            <div className="bg-white/90 backdrop-blur px-4 py-2 rounded-2xl shadow-lg border-2 border-sky-100 inline-flex items-center">
              <span className="text-sky-500 font-black text-sm md:text-base tracking-wider">LEVEL</span>
              <span className="ml-2 text-2xl md:text-3xl font-black text-neutral-800">{level}</span>
            </div>
          </div>

          {/* Lives Indicator */}
          <div className="absolute top-6 right-6 z-10 flex gap-1">
            {[...Array(3)].map((_, i) => (
              <span key={i} className={`text-2xl md:text-3xl transition-all duration-300 ${i < lives ? 'opacity-100 scale-100' : 'opacity-30 scale-75 grayscale'}`}>
                ❤️
              </span>
            ))}
          </div>

          <div className="absolute top-8 left-0 right-0 text-center pointer-events-none z-10">
            <span className="text-7xl md:text-8xl font-black text-white drop-shadow-[0_4px_0_rgba(0,0,0,0.2)] stroke-black stroke-2 tabular-nums tracking-tighter" style={{ WebkitTextStroke: '3px #1e293b' }}>
              {score}
            </span>
          </div>

          {/* Fever Indicator */}
          {physicsRef.current.isFever && (
            <div className="absolute top-32 md:top-40 left-0 right-0 text-center pointer-events-none z-10 animate-bounce">
              <span className="text-5xl md:text-7xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-red-500 to-pink-500 drop-shadow-[0_4px_0_rgba(0,0,0,0.3)] italic tracking-widest" style={{ WebkitTextStroke: '1px #fff' }}>
                FEVER TIME!
              </span>
            </div>
          )}

          {/* Level Up Indicator */}
          {showLevelUp && !physicsRef.current.isFever && (
            <div className="absolute top-40 md:top-48 left-0 right-0 flex flex-col items-center justify-center pointer-events-none z-20 animate-[bounce_1s_ease-in-out_infinite]">
              <span className="text-4xl md:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400 drop-shadow-[0_4px_0_rgba(0,0,0,0.3)] italic tracking-widest" style={{ WebkitTextStroke: '1px #fff' }}>
                LEVEL UP!
              </span>
              <div className="mt-3 bg-black/70 backdrop-blur-md px-5 py-2 rounded-full border border-white/20 shadow-xl">
                <span className="text-white font-bold text-sm md:text-lg tracking-wide">게임 속도가 올라갑니다! 🚀</span>
              </div>
            </div>
          )}
          
          {!hasStartedJumping && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10">
              <div className="mt-32 text-center animate-pulse">
                <p className="text-4xl md:text-5xl font-black text-white drop-shadow-[0_4px_0_rgba(0,0,0,0.3)] tracking-wide" style={{ WebkitTextStroke: '2px #1e293b' }}>
                  터치하여 점프!
                </p>
              </div>
            </div>
          )}
        </>
      )}

      {/* Game Over Screen */}
      {gameState === 'gameover' && (
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center z-10">
          <h2 className="text-5xl sm:text-6xl md:text-8xl font-black text-white mb-4 tracking-tight drop-shadow-[0_6px_0_#be123c]" style={{ WebkitTextStroke: '3px #881337' }}>GAME OVER</h2>
          <div className="bg-white rounded-3xl p-6 md:p-8 w-full max-w-[280px] md:max-w-sm mb-10 shadow-2xl border-4 border-sky-100">
            <p className="text-sky-500 text-lg font-black mb-1 tracking-widest">SCORE</p>
            <p className="text-7xl md:text-8xl font-black text-neutral-800 tabular-nums break-words">{score}</p>
            <div className="mt-4 pt-4 border-t-2 border-sky-50">
              <p className="text-neutral-400 text-sm font-bold tracking-widest">LEVEL REACHED</p>
              <p className="text-2xl md:text-3xl font-black text-neutral-700">{level}</p>
            </div>
          </div>
          <button onClick={goToMain} className="bg-gradient-to-b from-blue-400 to-blue-600 text-white font-black text-2xl md:text-3xl py-5 px-12 rounded-full transition-all shadow-[0_8px_0_#1d4ed8] hover:translate-y-1 hover:shadow-[0_4px_0_#1d4ed8] active:translate-y-2 active:shadow-none">
            메인으로
          </button>
        </div>
      )}
    </div>
  );
}

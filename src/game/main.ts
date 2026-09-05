import * as Phaser from 'phaser';
import { AUTO, Events, Game as PhaserGame, Scale, Scene } from 'phaser';

// ---------------------------------------------------------------------------
// GAME CONSTANTS
// ---------------------------------------------------------------------------
export const GAME_WIDTH = 540;
export const GAME_HEIGHT = 960;

export const COLORS = {
    ROAD: 0x26292E,
    ROAD_SHOULDER: 0x373B44,
    LANE_LINE: 0xE6ECEF,
    YELLOW_LINE: 0xF5B700,
    GRASS: 0x2E7D32,
    SIDEWALK: 0x8D6E63,
    BG: '#0e1117',
} as const;

// Event names
export const EVT_PHASE_CHANGED = 'phase-changed';
export const EVT_SCENE_READY = 'current-scene-ready';
export const EVT_SCORE_UPDATED = 'score-updated';
export const EVT_NEAR_MISS = 'near-miss';
export const EVT_START_GAME = 'start-game';
export const EVT_PAUSE_GAME = 'pause-game';
export const EVT_RESUME_GAME = 'resume-game';
export const EVT_RESTART_GAME = 'restart-game';
export const EVT_TRIGGER_HONK = 'trigger-honk';
export const EVT_RETURN_TO_MENU = 'return-to-menu';

// Lane positions (4 main traffic lanes)
const LANE_WIDTH = 100;
const ROAD_LEFT = 60;
const LANES = [
    ROAD_LEFT + 50,                  // Lane 0: 110
    ROAD_LEFT + 50 + LANE_WIDTH,      // Lane 1: 210
    ROAD_LEFT + 50 + LANE_WIDTH * 2, // Lane 2: 310
    ROAD_LEFT + 50 + LANE_WIDTH * 3, // Lane 3: 410
];
const ROAD_RIGHT = ROAD_LEFT + LANE_WIDTH * 4 + 20; // 480

// ---------------------------------------------------------------------------
// EVENT BUS
// ---------------------------------------------------------------------------
export const EventBus = new Events.EventEmitter();

// ---------------------------------------------------------------------------
// WEB AUDIO - PROCEDURAL AFROBEATS SYNTHESIZER & LAGOS HORN
// ---------------------------------------------------------------------------
class AfrobeatsEngine {
    private ctx: AudioContext | null = null;
    private playing = false;
    private muted = false;
    private timerId: number | null = null;
    private step = 0;

    init() {
        if (this.ctx) return;
        try {
            const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
            if (AudioCtx) {
                this.ctx = new AudioCtx();
            }
        } catch (_e) {
            // Audio context not allowed
        }
    }

    start() {
        this.init();
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume().catch(() => {});
        }
        if (!this.ctx || this.playing || this.muted) return;
        this.playing = true;
        this.step = 0;
        this.timerId = window.setInterval(() => this.tick(), 125);
    }

    stop() {
        this.playing = false;
        if (this.timerId !== null) {
            clearInterval(this.timerId);
            this.timerId = null;
        }
    }

    toggleMute(): boolean {
        this.muted = !this.muted;
        if (this.muted) {
            this.stop();
        } else {
            this.start();
        }
        return this.muted;
    }

    isMuted() {
        return this.muted;
    }

    private tick() {
        if (!this.ctx || !this.playing || this.muted) return;
        const t = this.ctx.currentTime;
        const s = this.step % 16;

        // Syncopated Afrobeats Bassline
        const bassFreqs = [
            87.31, 0, 87.31, 0,
            0, 103.83, 0, 87.31,
            116.54, 0, 0, 103.83,
            0, 87.31, 103.83, 0
        ];
        const freq = bassFreqs[s];
        if (freq > 0) {
            this.playTone(freq, t, 0.18, 'sawtooth', 0.11, 400);
        }

        // Shekere / Shaker percussion
        const shakerVol = (s % 2 === 1) ? 0.05 : 0.025;
        this.playNoise(t, 0.04, shakerVol);

        // Conga / Talking drum syncopation
        if (s === 2 || s === 8 || s === 14) {
            this.playTone(220, t, 0.09, 'triangle', 0.08);
        } else if (s === 5 || s === 11) {
            this.playTone(330, t, 0.07, 'triangle', 0.09);
        }

        // Brass Horn Stabs
        if (s === 0) {
            this.playTone(349.23, t, 0.18, 'sawtooth', 0.05, 800);
            this.playTone(440.00, t, 0.18, 'sawtooth', 0.05, 800);
        } else if (s === 7) {
            this.playTone(392.00, t, 0.14, 'sawtooth', 0.05, 800);
            this.playTone(493.88, t, 0.14, 'sawtooth', 0.04, 800);
        }

        this.step++;
    }

    private playTone(freq: number, time: number, dur: number, type: OscillatorType, vol: number, filterFreq?: number) {
        if (!this.ctx) return;
        try {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(freq, time);

            gain.gain.setValueAtTime(vol, time);
            gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);

            if (filterFreq) {
                const filter = this.ctx.createBiquadFilter();
                filter.type = 'lowpass';
                filter.frequency.setValueAtTime(filterFreq, time);
                osc.connect(filter);
                filter.connect(gain);
            } else {
                osc.connect(gain);
            }

            gain.connect(this.ctx.destination);
            osc.start(time);
            osc.stop(time + dur);
        } catch (_e) {
            // ignore
        }
    }

    private playNoise(time: number, dur: number, vol: number) {
        if (!this.ctx) return;
        try {
            const bufferSize = Math.floor(this.ctx.sampleRate * dur);
            const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = Math.random() * 2 - 1;
            }
            const src = this.ctx.createBufferSource();
            src.buffer = buffer;
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'highpass';
            filter.frequency.setValueAtTime(2000, time);

            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(vol, time);
            gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);

            src.connect(filter);
            filter.connect(gain);
            gain.connect(this.ctx.destination);
            src.start(time);
        } catch (_e) {
            // ignore
        }
    }

    honk() {
        this.init();
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume().catch(() => {});
        }
        if (!this.ctx || this.muted) return;
        try {
            const t = this.ctx.currentTime;
            this.playTone(392, t, 0.28, 'sawtooth', 0.16, 1200);
            this.playTone(493.88, t + 0.02, 0.26, 'sawtooth', 0.14, 1200);
            this.playTone(392, t + 0.15, 0.22, 'sawtooth', 0.14, 1200);
            this.playTone(523.25, t + 0.17, 0.20, 'sawtooth', 0.12, 1200);
        } catch (_e) {
            // ignore
        }
    }
}

export const audioEngine = new AfrobeatsEngine();

// ---------------------------------------------------------------------------
// GAME SCENE
// ---------------------------------------------------------------------------
export class Game extends Scene {
    private player!: Phaser.Physics.Arcade.Sprite;
    private traffic!: Phaser.Physics.Arcade.Group;
    private hazards!: Phaser.Physics.Arcade.Group;
    private collectibles!: Phaser.Physics.Arcade.Group;
    private roadLines!: Phaser.GameObjects.Group;
    private scenery!: Phaser.GameObjects.Group;

    private keys!: Record<string, Phaser.Input.Keyboard.Key>;
    private phase: string = 'MENU';
    private score = 0;
    private distance = 0;
    private speed = 4;
    private targetSpeed = 4;
    private maxSpeed = 11;
    private fuel = 100;
    private lives = 3;
    private multiplier = 1;
    private nearMissCount = 0;
    private nearMissStreak = 0;
    private spawnTimer = 0;
    private hazardTimer = 0;
    private collectTimer = 0;
    private sceneryTimer = 0;
    private countdownValue = 3;
    private countdownTimer: Phaser.Time.TimerEvent | null = null;
    private difficulty = 1;
    private invincible = false;
    private invincibleTimer = 0;
    private honkCooldown = 0;
    private nitroActive = false;
    private nitroTimer = 0;
    private touchLeft = false;
    private touchRight = false;
    private touchNitro = false;
    private touchBrake = false;
    private highScore = 0;

    constructor() {
        super('Game');
    }

    preload() {
        this.load.image('smoke_particle', 'assets/fx/smoke.png');
        this.load.image('spark_particle', 'assets/fx/spark.png');
        this.load.image('glow_particle', 'assets/fx/glow.png');
        this.load.audio('sfx_hit', 'assets/audio/sfx_hit.mp3');
        this.load.audio('sfx_collect', 'assets/audio/sfx_collect.mp3');
        this.load.audio('sfx_powerup', 'assets/audio/sfx_powerup.mp3');
        this.load.audio('sfx_button', 'assets/audio/sfx_button.mp3');
        this.load.audio('sfx_gameover', 'assets/audio/sfx_gameover.mp3');
        this.load.audio('sfx_win', 'assets/audio/sfx_win.mp3');
    }

    create() {
        // --- 1. Procedural Texture Generation using a single Graphics instance ---
        const g = this.add.graphics();

        // 1. Player Car
        g.fillStyle(0x000000, 0.35); g.fillRoundedRect(2, 4, 40, 70, 8);
        g.fillStyle(0x008751); g.fillRoundedRect(0, 0, 40, 70, 8);
        g.fillStyle(0xFFFFFF); g.fillRect(13, 0, 14, 70);
        g.fillStyle(0x008751); g.fillRect(16, 0, 8, 70);
        g.fillStyle(0x29B6F6); g.fillRoundedRect(6, 14, 28, 16, 4);
        g.fillStyle(0xE1F5FE); g.fillRect(8, 16, 10, 4);
        g.fillStyle(0x0288D1); g.fillRoundedRect(6, 46, 28, 12, 3);
        g.fillStyle(0xFFEB3B); g.fillRect(3, 1, 8, 4); g.fillRect(29, 1, 8, 4);
        g.fillStyle(0xF44336); g.fillRect(3, 65, 8, 4); g.fillRect(29, 65, 8, 4);
        g.fillStyle(0x008751); g.fillRect(0, 20, 2, 6); g.fillRect(38, 20, 2, 6);
        g.generateTexture('player_car', 42, 74);
        g.clear();

        // 2. Danfo Minibus
        g.fillStyle(0x000000, 0.4); g.fillRoundedRect(2, 4, 48, 92, 7);
        g.fillStyle(0xFFCC00); g.fillRoundedRect(0, 0, 48, 92, 7);
        g.fillStyle(0x111111); g.fillRect(0, 22, 48, 7); g.fillRect(0, 62, 48, 7);
        g.fillStyle(0x4FC3F7); g.fillRoundedRect(5, 5, 38, 14, 3);
        g.fillStyle(0x0288D1); g.fillRoundedRect(6, 74, 36, 10, 2);
        g.fillStyle(0x263238); g.fillRect(4, 34, 8, 22); g.fillRect(36, 34, 8, 22);
        g.fillStyle(0x5D4037); g.fillRoundedRect(10, 36, 28, 18, 2);
        g.fillStyle(0xE65100); g.fillRect(14, 38, 10, 14);
        g.fillStyle(0x1565C0); g.fillRect(26, 40, 10, 10);
        g.fillStyle(0xFFEE58); g.fillRect(4, 1, 9, 4); g.fillRect(35, 1, 9, 4);
        g.fillStyle(0xD32F2F); g.fillRect(4, 87, 8, 4); g.fillRect(36, 87, 8, 4);
        g.generateTexture('danfo_van', 50, 96);
        g.clear();

        // 3. Keke Napep
        g.fillStyle(0x000000, 0.35); g.fillRoundedRect(2, 4, 36, 56, 6);
        g.fillStyle(0xFFD600); g.fillRoundedRect(0, 8, 36, 48, 6);
        g.fillStyle(0xFFAB00); g.fillTriangle(4, 12, 32, 12, 18, 0);
        g.fillStyle(0x212121); g.fillRoundedRect(3, 14, 30, 28, 4);
        g.fillStyle(0x81D4FA); g.fillRect(6, 10, 24, 7);
        g.fillStyle(0x111111); g.fillCircle(18, 3, 3);
        g.fillCircle(4, 50, 4); g.fillCircle(32, 50, 4);
        g.fillStyle(0xFFEB3B); g.fillCircle(18, 1, 3);
        g.generateTexture('keke_napep', 38, 60);
        g.clear();

        // 4. Okada Motorcycle
        g.fillStyle(0x000000, 0.3); g.fillEllipse(16, 26, 26, 48);
        g.fillStyle(0xD50000); g.fillRect(13, 8, 6, 36);
        g.fillStyle(0x1A1A1A); g.fillRect(14, 0, 4, 8); g.fillRect(14, 44, 4, 8);
        g.fillStyle(0x1976D2); g.fillRoundedRect(9, 14, 14, 14, 3);
        g.fillStyle(0xFFC107); g.fillCircle(16, 12, 5);
        g.fillStyle(0xFF6D00); g.fillCircle(16, 34, 5);
        g.fillStyle(0x388E3C); g.fillRoundedRect(10, 26, 12, 10, 2);
        g.generateTexture('okada_bike', 32, 54);
        g.clear();

        // 5. BRT Bus
        g.fillStyle(0x000000, 0.4); g.fillRoundedRect(2, 4, 46, 114, 8);
        g.fillStyle(0xC62828); g.fillRoundedRect(0, 0, 46, 114, 8);
        g.fillStyle(0xFFFFFF); g.fillRect(4, 8, 38, 12);
        g.fillStyle(0x1565C0); g.fillRect(4, 24, 38, 4);
        g.fillStyle(0x4FC3F7); g.fillRoundedRect(5, 5, 36, 10, 2);
        g.fillStyle(0x263238);
        g.fillRect(5, 34, 10, 26); g.fillRect(31, 34, 10, 26);
        g.fillRect(5, 66, 10, 28); g.fillRect(31, 66, 28, 28);
        g.fillStyle(0xFFEE58); g.fillRect(4, 1, 8, 4); g.fillRect(34, 1, 8, 4);
        g.fillStyle(0xFF1744); g.fillRect(4, 109, 8, 4); g.fillRect(34, 109, 8, 4);
        g.generateTexture('brt_bus', 48, 118);
        g.clear();

        // 6. Civil Car Blue
        g.fillStyle(0x000000, 0.35); g.fillRoundedRect(2, 4, 38, 68, 6);
        g.fillStyle(0x1565C0); g.fillRoundedRect(0, 0, 38, 68, 6);
        g.fillStyle(0x81D4FA); g.fillRoundedRect(5, 12, 28, 16, 3);
        g.fillStyle(0x0D47A1); g.fillRect(5, 32, 28, 18);
        g.fillStyle(0xFFEB3B); g.fillRect(4, 1, 7, 3); g.fillRect(27, 1, 7, 3);
        g.fillStyle(0xFF1744); g.fillRect(4, 64, 7, 3); g.fillRect(27, 64, 7, 3);
        g.generateTexture('civil_car_blue', 40, 72);
        g.clear();

        // 7. Civil Car Silver
        g.fillStyle(0x000000, 0.35); g.fillRoundedRect(2, 4, 38, 68, 6);
        g.fillStyle(0xB0BEC5); g.fillRoundedRect(0, 0, 38, 68, 6);
        g.fillStyle(0xECEFF1); g.fillRect(8, 0, 22, 68);
        g.fillStyle(0x78909C); g.fillRoundedRect(5, 12, 28, 16, 3);
        g.fillStyle(0x90A4AE); g.fillRect(5, 32, 28, 18);
        g.fillStyle(0xFFEB3B); g.fillRect(4, 1, 7, 3); g.fillRect(27, 1, 7, 3);
        g.fillStyle(0xFF1744); g.fillRect(4, 64, 7, 3); g.fillRect(27, 64, 7, 3);
        g.generateTexture('civil_car_silver', 40, 72);
        g.clear();

        // 8. Pothole Hazard
        g.fillStyle(0x1E2124); g.fillEllipse(26, 20, 52, 38);
        g.fillStyle(0x101214); g.fillEllipse(26, 20, 42, 28);
        g.fillStyle(0x1A237E, 0.7); g.fillEllipse(24, 22, 24, 14);
        g.fillStyle(0x80D8FF, 0.5); g.fillEllipse(22, 20, 10, 5);
        g.fillStyle(0x424242); g.fillRect(8, 16, 4, 4); g.fillRect(42, 22, 5, 3); g.fillRect(20, 32, 4, 4);
        g.generateTexture('pothole_hazard', 54, 42);
        g.clear();

        // 9. Traffic Light Red
        g.fillStyle(0x000000, 0.5); g.fillRect(2, 4, 44, 64);
        g.fillStyle(0x212121); g.fillRoundedRect(0, 0, 44, 64, 6);
        g.fillStyle(0xFF1744); g.fillCircle(22, 14, 9);
        g.fillStyle(0xFF8A80); g.fillCircle(22, 13, 4);
        g.fillStyle(0x3E2723); g.fillCircle(22, 32, 7);
        g.fillStyle(0x1B5E20); g.fillCircle(22, 50, 7);
        g.generateTexture('traffic_light_red', 46, 68);
        g.clear();

        // 10. Roadside Market Stall
        g.fillStyle(0x000000, 0.4); g.fillEllipse(30, 44, 56, 20);
        g.fillStyle(0xE91E63); g.fillTriangle(0, 24, 60, 24, 30, 0);
        g.fillStyle(0xFFD600); g.fillTriangle(12, 24, 48, 24, 30, 0);
        g.fillStyle(0x00E5FF); g.fillTriangle(22, 24, 38, 24, 30, 0);
        g.fillStyle(0x5D4037); g.fillRect(28, 24, 4, 24);
        g.fillStyle(0x8D6E63); g.fillRect(8, 30, 44, 14);
        g.fillStyle(0xFFD600); g.fillCircle(16, 34, 4); g.fillCircle(22, 34, 4);
        g.fillStyle(0x4CAF50); g.fillCircle(30, 34, 4); g.fillCircle(36, 34, 4);
        g.fillStyle(0xFF1744); g.fillCircle(44, 34, 3);
        g.generateTexture('roadside_stall', 62, 52);
        g.clear();

        // 11. Bus Stop
        g.fillStyle(0x000000, 0.4); g.fillRect(2, 44, 68, 10);
        g.fillStyle(0x00897B); g.fillRoundedRect(0, 0, 68, 8, 2);
        g.fillStyle(0x37474F); g.fillRect(6, 8, 4, 40); g.fillRect(58, 8, 4, 40);
        g.fillStyle(0x80CBC4, 0.6); g.fillRect(10, 10, 48, 26);
        g.fillStyle(0xFFB300); g.fillCircle(20, 26, 5); g.fillStyle(0x1E88E5); g.fillRect(16, 31, 8, 14);
        g.fillStyle(0xFF7043); g.fillCircle(36, 24, 5); g.fillStyle(0x43A047); g.fillRect(32, 29, 8, 16);
        g.fillStyle(0xAB47BC); g.fillCircle(50, 27, 5); g.fillStyle(0xE53935); g.fillRect(46, 32, 8, 13);
        g.generateTexture('bus_stop', 70, 52);
        g.clear();

        // 12. Naira Coin
        g.fillStyle(0x000000, 0.3); g.fillCircle(18, 18, 16);
        g.fillStyle(0xFFD700); g.fillCircle(16, 16, 15);
        g.fillStyle(0xFFA000); g.fillCircle(16, 16, 12);
        g.fillStyle(0x1B5E20);
        g.fillRect(10, 8, 3, 16); g.fillRect(19, 8, 3, 16);
        g.fillTriangle(10, 8, 22, 24, 19, 24);
        g.fillRect(8, 13, 16, 2); g.fillRect(8, 17, 16, 2);
        g.generateTexture('coin_naira', 34, 34);
        g.clear();

        // 13. Fuel Can
        g.fillStyle(0x000000, 0.3); g.fillRoundedRect(2, 4, 28, 32, 4);
        g.fillStyle(0xE53935); g.fillRoundedRect(0, 4, 28, 32, 4);
        g.fillStyle(0x212121); g.fillRect(8, 0, 12, 5); g.fillRect(18, 1, 6, 4);
        g.fillStyle(0xFFEB3B); g.fillTriangle(14, 14, 9, 26, 19, 26);
        g.fillCircle(14, 24, 5);
        g.generateTexture('fuel_can', 30, 38);
        g.clear();

        // 14. Nitro Can
        g.fillStyle(0x000000, 0.3); g.fillRoundedRect(2, 4, 26, 34, 5);
        g.fillStyle(0x00B0FF); g.fillRoundedRect(0, 4, 26, 34, 5);
        g.fillStyle(0x0081CB); g.fillRect(0, 16, 26, 8);
        g.fillStyle(0xCFD8DC); g.fillRect(8, 0, 10, 5);
        g.fillStyle(0xFFFFFF);
        g.fillTriangle(14, 8, 9, 20, 16, 20);
        g.fillTriangle(16, 18, 11, 32, 17, 32);
        g.generateTexture('nitro_can', 28, 40);
        g.clear();

        // 15. Road Lane Line
        g.fillStyle(0xE6ECEF); g.fillRect(0, 0, 4, 34);
        g.generateTexture('road_line', 4, 34);
        g.clear();

        // 16. Yellow Double Line
        g.fillStyle(0xF5B700); g.fillRect(0, 0, 3, 44); g.fillRect(5, 0, 3, 44);
        g.generateTexture('yellow_line', 8, 44);
        g.clear();

        // 17. Palm Tree
        g.fillStyle(0x5D4037); g.fillRect(13, 10, 6, 34);
        g.fillStyle(0x2E7D32);
        g.fillCircle(16, 10, 14);
        g.fillCircle(8, 6, 10);
        g.fillCircle(24, 6, 10);
        g.generateTexture('scenery_palm', 32, 46);
        g.clear();

        // 18. Building
        g.fillStyle(0x455A64); g.fillRect(0, 0, 40, 56);
        g.fillStyle(0xFFD500); g.fillRect(2, 4, 36, 10);
        g.fillStyle(0x1B5E20); g.fillRect(6, 6, 28, 6);
        g.fillStyle(0xFFF59D);
        g.fillRect(6, 18, 10, 12); g.fillRect(24, 18, 10, 12);
        g.fillStyle(0x263238); g.fillRect(14, 34, 12, 22);
        g.generateTexture('scenery_building', 40, 56);
        g.clear();

        // 19. Streetlight
        g.fillStyle(0x78909C); g.fillRect(4, 0, 4, 48);
        g.fillRect(4, 0, 14, 4);
        g.fillStyle(0xFFEB3B); g.fillCircle(16, 4, 5);
        g.generateTexture('scenery_streetlight', 22, 50);
        g.destroy();

        // --- 2. Background and Environment ---
        this.cameras.main.setBackgroundColor('#10141a');

        this.add.rectangle(ROAD_LEFT / 2, GAME_HEIGHT / 2, ROAD_LEFT, GAME_HEIGHT, COLORS.GRASS).setScrollFactor(0);
        this.add.rectangle(ROAD_RIGHT + (GAME_WIDTH - ROAD_RIGHT) / 2, GAME_HEIGHT / 2, GAME_WIDTH - ROAD_RIGHT, GAME_HEIGHT, COLORS.GRASS).setScrollFactor(0);
        this.add.rectangle(ROAD_LEFT - 8, GAME_HEIGHT / 2, 16, GAME_HEIGHT, COLORS.ROAD_SHOULDER).setScrollFactor(0);
        this.add.rectangle(ROAD_RIGHT + 8, GAME_HEIGHT / 2, 16, GAME_HEIGHT, COLORS.ROAD_SHOULDER).setScrollFactor(0);
        this.add.rectangle((ROAD_LEFT + ROAD_RIGHT) / 2, GAME_HEIGHT / 2, ROAD_RIGHT - ROAD_LEFT, GAME_HEIGHT, COLORS.ROAD).setScrollFactor(0);
        this.add.rectangle(ROAD_LEFT, GAME_HEIGHT / 2, 4, GAME_HEIGHT, 0xFFFFFF).setScrollFactor(0);
        this.add.rectangle(ROAD_RIGHT, GAME_HEIGHT / 2, 4, GAME_HEIGHT, 0xFFFFFF).setScrollFactor(0);

        // --- 3. Road Markings ---
        this.roadLines = this.add.group();
        for (let y = -60; y < GAME_HEIGHT + 60; y += 60) {
            const l1 = this.add.image(ROAD_LEFT + LANE_WIDTH, y, 'road_line');
            l1.setScrollFactor(0);
            this.roadLines.add(l1);

            const yl = this.add.image(ROAD_LEFT + LANE_WIDTH * 2, y, 'yellow_line');
            yl.setScrollFactor(0);
            this.roadLines.add(yl);

            const l3 = this.add.image(ROAD_LEFT + LANE_WIDTH * 3, y, 'road_line');
            l3.setScrollFactor(0);
            this.roadLines.add(l3);
        }

        // --- 4. Groups ---
        this.traffic = this.physics.add.group();
        this.hazards = this.physics.add.group();
        this.collectibles = this.physics.add.group();
        this.scenery = this.add.group();

        // --- 5. Player ---
        this.player = this.physics.add.sprite(LANES[1], GAME_HEIGHT - 140, 'player_car');
        this.player.setCollideWorldBounds(true);
        this.player.setDepth(15);
        (this.player.body as Phaser.Physics.Arcade.Body).setSize(34, 62);
        (this.player.body as Phaser.Physics.Arcade.Body).setOffset(3, 4);

        if (this.textures.exists('smoke_particle')) {
            const particles = this.add.particles(0, 0, 'smoke_particle', {
                speed: { min: 20, max: 50 },
                angle: { min: 80, max: 100 },
                scale: { start: 0.15, end: 0 },
                alpha: { start: 0.4, end: 0 },
                lifespan: 300,
                blendMode: 'NORMAL',
            });
            particles.setDepth(14);
            particles.startFollow(this.player, 0, 32);
        }

        // --- 6. Input ---
        if (this.input.keyboard) {
            this.keys = this.input.keyboard.addKeys('LEFT,RIGHT,UP,DOWN,A,D,W,S,SPACE,H,ESC,P') as Record<string, Phaser.Input.Keyboard.Key>;
            this.input.keyboard.on('keydown-ESC', () => this.togglePause());
            this.input.keyboard.on('keydown-P', () => this.togglePause());
            this.input.keyboard.on('keydown-SPACE', () => {
                if (this.phase === 'MENU') this.startCountdown();
                else if (this.phase === 'FINISHED') this.restartGame();
                else if (this.phase === 'PLAYING') this.honkHorn();
            });
            this.input.keyboard.on('keydown-ENTER', () => {
                if (this.phase === 'MENU') this.startCountdown();
                else if (this.phase === 'FINISHED') this.restartGame();
            });
            this.input.keyboard.on('keydown-H', () => {
                if (this.phase === 'PLAYING') this.honkHorn();
            });
        }

        this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            if (this.phase !== 'PLAYING') return;
            if (pointer.x < GAME_WIDTH * 0.4) {
                this.touchLeft = true;
            } else if (pointer.x > GAME_WIDTH * 0.6) {
                this.touchRight = true;
            }
        });
        this.input.on('pointerup', () => {
            this.touchLeft = false;
            this.touchRight = false;
        });

        // --- 7. Collisions & Overlaps ---
        this.physics.add.overlap(this.player, this.traffic, (_p, target) => {
            if (this.invincible) return;
            const t = target as Phaser.Physics.Arcade.Sprite;
            if (!t || !t.active) return;
            this.handleCrash(t);
        }, undefined, this);

        this.physics.add.overlap(this.player, this.hazards, (_p, target) => {
            if (this.invincible) return;
            const t = target as Phaser.Physics.Arcade.Sprite;
            if (!t || !t.active) return;
            this.handleHazard(t);
        }, undefined, this);

        this.physics.add.overlap(this.player, this.collectibles, (_p, target) => {
            const t = target as Phaser.Physics.Arcade.Sprite;
            if (!t || !t.active) return;
            this.handleCollect(t);
        }, undefined, this);

        // --- 8. Event Bus Bindings ---
        EventBus.on(EVT_START_GAME, () => this.startCountdown(), this);
        EventBus.on(EVT_PAUSE_GAME, () => this.togglePause(), this);
        EventBus.on(EVT_RESUME_GAME, () => this.togglePause(), this);
        EventBus.on(EVT_RESTART_GAME, () => this.restartGame(), this);
        EventBus.on(EVT_RETURN_TO_MENU, () => this.returnToMenu(), this);
        EventBus.on(EVT_TRIGGER_HONK, () => this.honkHorn(), this);

        this.highScore = parseInt(
            localStorage.getItem('danfo_frenzy_lagos_highscore')
            || localStorage.getItem('nigeria_traffic_dash_highscore')
            || '0', 10);
        this.phase = 'MENU';
        EventBus.emit(EVT_PHASE_CHANGED, 'MENU');
        EventBus.emit(EVT_SCENE_READY, this);
    }

    update(time: number, delta: number) {
        if (this.phase !== 'PLAYING') return;
        const dt = Math.min(delta / 1000, 0.1);

        // Difficulty scaling
        this.difficulty = 1 + this.distance / 1500;
        this.maxSpeed = Math.min(14, 8 + this.difficulty * 1.5);

        // Speed control
        let baseTarget = 4.5 + this.difficulty * 1.2;
        if (this.nitroActive) {
            baseTarget = this.maxSpeed + 3;
            this.nitroTimer -= dt;
            if (this.nitroTimer <= 0) {
                this.nitroActive = false;
            }
        }

        // Input Polling
        const leftDown = (this.keys && (this.keys.LEFT.isDown || this.keys.A.isDown)) || this.touchLeft;
        const rightDown = (this.keys && (this.keys.RIGHT.isDown || this.keys.D.isDown)) || this.touchRight;
        const upDown = (this.keys && (this.keys.UP.isDown || this.keys.W.isDown)) || this.touchNitro;
        const downDown = (this.keys && (this.keys.DOWN.isDown || this.keys.S.isDown)) || this.touchBrake;

        if (upDown) {
            baseTarget = Math.min(baseTarget + 3.5, this.maxSpeed);
        }
        if (downDown) {
            baseTarget = Math.max(baseTarget - 3.5, 2.5);
        }

        this.targetSpeed = baseTarget;
        this.speed = Phaser.Math.Linear(this.speed, this.targetSpeed, 0.08);

        // Player lateral movement
        const steerSpeed = 320;
        if (leftDown) {
            this.player.x -= steerSpeed * dt;
        }
        if (rightDown) {
            this.player.x += steerSpeed * dt;
        }

        // Keep player strictly on the road
        this.player.x = Phaser.Math.Clamp(this.player.x, ROAD_LEFT + 22, ROAD_RIGHT - 22);

        // Tilt effect when steering
        const targetTilt = (leftDown ? -0.16 : 0) + (rightDown ? 0.16 : 0);
        this.player.rotation = Phaser.Math.Linear(this.player.rotation, targetTilt, 0.15);

        // Fuel consumption
        this.fuel -= dt * (1.2 + this.speed * 0.22);
        if (this.fuel <= 0) {
            this.fuel = 0;
            this.gameOver();
            return;
        }

        // Distance and score progression
        const metersThisFrame = this.speed * dt * 14;
        this.distance += metersThisFrame;
        this.score += metersThisFrame * this.multiplier * (this.nitroActive ? 2.5 : 1.2);

        // Invincibility flashing
        if (this.invincible) {
            this.invincibleTimer -= dt;
            this.player.setAlpha(Math.sin(time * 0.025) > 0 ? 0.35 : 0.9);
            if (this.invincibleTimer <= 0) {
                this.invincible = false;
                this.player.setAlpha(1);
            }
        }

        // Honk cooldown
        if (this.honkCooldown > 0) {
            this.honkCooldown -= dt;
        }

        // Scroll Road lines
        this.scrollRoadLines(delta);

        // Spawn traffic, hazards, collectibles, scenery
        this.spawnTimer -= dt;
        if (this.spawnTimer <= 0) {
            this.spawnTrafficVehicle();
            this.spawnTimer = Math.max(0.55, 1.7 - this.difficulty * 0.18);
        }

        this.hazardTimer -= dt;
        if (this.hazardTimer <= 0) {
            this.spawnRoadHazard();
            this.hazardTimer = Math.max(2.2, 5.0 - this.difficulty * 0.4);
        }

        this.collectTimer -= dt;
        if (this.collectTimer <= 0) {
            this.spawnCollectibleItem();
            this.collectTimer = Math.max(1.4, 3.2 - this.difficulty * 0.25);
        }

        this.sceneryTimer -= dt;
        if (this.sceneryTimer <= 0) {
            this.spawnRoadsideScenery();
            this.sceneryTimer = 0.6;
        }

        // Move active entities
        this.moveActiveEntities(dt);

        // Near-miss detection
        this.checkNearMisses();

        // Broadcast HUD telemetry
        EventBus.emit(EVT_SCORE_UPDATED, {
            score: Math.floor(this.score),
            distance: Math.floor(this.distance),
            multiplier: Number(this.multiplier.toFixed(1)),
            speed: Math.floor(this.speed * 14),
            fuel: Math.floor(this.fuel),
            lives: this.lives,
            nearMissCount: this.nearMissCount,
        });
    }

    private scrollRoadLines(delta: number) {
        if (!this.roadLines) return;
        const scrollOffset = this.speed * delta * 0.7;
        const children = this.roadLines.getChildren();
        for (let i = 0; i < children.length; i++) {
            const line = children[i] as Phaser.GameObjects.Image;
            if (!line) continue;
            line.y += scrollOffset;
            if (line.y > GAME_HEIGHT + 60) {
                line.y -= (GAME_HEIGHT + 120);
            }
        }
    }

    private spawnTrafficVehicle() {
        if (!this.traffic) return;
        const lane = Math.floor(Math.random() * LANES.length);
        const types = ['danfo_van', 'keke_napep', 'okada_bike', 'brt_bus', 'civil_car_blue', 'civil_car_silver'];
        const weights = [0.25, 0.22, 0.20, 0.11, 0.11, 0.11];
        let r = Math.random();
        let selectedType = types[0];
        for (let i = 0; i < weights.length; i++) {
            r -= weights[i];
            if (r <= 0) {
                selectedType = types[i];
                break;
            }
        }

        const xPos = LANES[lane];
        const sprite = this.traffic.create(xPos, -90, selectedType) as Phaser.Physics.Arcade.Sprite;
        if (!sprite) return;

        sprite.setDepth(6);
        sprite.setData('lane', lane);
        sprite.setData('type', selectedType);
        const baseSpeed = selectedType === 'okada_bike' ? 3.5 : (selectedType === 'brt_bus' ? 1.0 : (1.5 + Math.random() * 2));
        sprite.setData('baseSpeed', baseSpeed);

        if (Math.random() < 0.4 && (selectedType === 'danfo_van' || selectedType === 'okada_bike')) {
            const dir = (lane === 0) ? 1 : (lane === LANES.length - 1 ? -1 : (Math.random() < 0.5 ? -1 : 1));
            sprite.setData('laneChange', dir);
            sprite.setData('changeTimer', 0.8 + Math.random() * 1.5);
        }

        const body = sprite.body as Phaser.Physics.Arcade.Body;
        if (body) {
            body.setAllowGravity(false);
            body.setVelocityY(this.speed * 32 + baseSpeed * 22);
        }
    }

    private spawnRoadHazard() {
        if (!this.hazards) return;
        const lane = Math.floor(Math.random() * LANES.length);
        const types = ['pothole_hazard', 'traffic_light_red', 'roadside_stall', 'bus_stop'];
        const selectedType = types[Math.floor(Math.random() * types.length)];

        let xPos = LANES[lane];
        if (selectedType === 'roadside_stall' || selectedType === 'bus_stop') {
            xPos = (lane < 2) ? (ROAD_LEFT + 15) : (ROAD_RIGHT - 15);
        }

        const sprite = this.hazards.create(xPos, -70, selectedType) as Phaser.Physics.Arcade.Sprite;
        if (!sprite) return;

        sprite.setDepth(5);
        sprite.setData('type', selectedType);
        const body = sprite.body as Phaser.Physics.Arcade.Body;
        if (body) {
            body.setAllowGravity(false);
            body.setVelocityY(this.speed * 32);
        }
    }

    private spawnCollectibleItem() {
        if (!this.collectibles) return;
        const lane = Math.floor(Math.random() * LANES.length);
        const types = ['coin_naira', 'coin_naira', 'coin_naira', 'fuel_can', 'nitro_can'];
        const selectedType = types[Math.floor(Math.random() * types.length)];

        const sprite = this.collectibles.create(LANES[lane], -50, selectedType) as Phaser.Physics.Arcade.Sprite;
        if (!sprite) return;

        sprite.setDepth(7);
        sprite.setData('type', selectedType);
        const body = sprite.body as Phaser.Physics.Arcade.Body;
        if (body) {
            body.setAllowGravity(false);
            body.setVelocityY(this.speed * 32);
        }

        this.tweens.add({
            targets: sprite,
            scaleX: 1.15,
            scaleY: 1.15,
            yoyo: true,
            repeat: -1,
            duration: 350,
        });
    }

    private spawnRoadsideScenery() {
        if (!this.scenery) return;
        const isLeft = Math.random() < 0.5;
        const xPos = isLeft ? (Math.random() * (ROAD_LEFT - 20) + 10) : (ROAD_RIGHT + 15 + Math.random() * (GAME_WIDTH - ROAD_RIGHT - 30));
        const types = ['scenery_palm', 'scenery_building', 'scenery_streetlight'];
        const selectedType = types[Math.floor(Math.random() * types.length)];

        const obj = this.scenery.create(xPos, -40, selectedType) as Phaser.GameObjects.Image;
        if (obj) {
            obj.setScrollFactor(0);
            obj.setDepth(2);
        }
    }

    private moveActiveEntities(dt: number) {
        if (this.traffic && typeof this.traffic.getChildren === 'function') {
            this.traffic.getChildren().forEach((child) => {
                const sprite = child as Phaser.Physics.Arcade.Sprite;
                if (!sprite || !sprite.active) return;
                const body = sprite.body as Phaser.Physics.Arcade.Body;
                if (body) {
                    const baseSpeed = (sprite.getData('baseSpeed') as number) || 2;
                    body.setVelocityY(this.speed * 32 + baseSpeed * 22);
                }

                const changeTimer = sprite.getData('changeTimer') as number | undefined;
                if (changeTimer !== undefined && changeTimer !== null) {
                    const nextTimer = changeTimer - dt;
                    if (nextTimer <= 0) {
                        const dir = sprite.getData('laneChange') as number;
                        const currentLane = sprite.getData('lane') as number;
                        const nextLane = currentLane + dir;
                        if (nextLane >= 0 && nextLane < LANES.length) {
                            sprite.setData('lane', nextLane);
                            this.tweens.add({
                                targets: sprite,
                                x: LANES[nextLane],
                                duration: 550,
                                ease: 'Cubic.easeInOut',
                            });
                        }
                        sprite.setData('changeTimer', null);
                    } else {
                        sprite.setData('changeTimer', nextTimer);
                    }
                }

                if (sprite.y > GAME_HEIGHT + 120) {
                    sprite.destroy();
                }
            });
        }

        if (this.hazards && typeof this.hazards.getChildren === 'function') {
            this.hazards.getChildren().forEach((child) => {
                const sprite = child as Phaser.Physics.Arcade.Sprite;
                if (!sprite || !sprite.active) return;
                const body = sprite.body as Phaser.Physics.Arcade.Body;
                if (body) {
                    body.setVelocityY(this.speed * 32);
                }
                if (sprite.y > GAME_HEIGHT + 100) {
                    sprite.destroy();
                }
            });
        }

        if (this.collectibles && typeof this.collectibles.getChildren === 'function') {
            this.collectibles.getChildren().forEach((child) => {
                const sprite = child as Phaser.Physics.Arcade.Sprite;
                if (!sprite || !sprite.active) return;
                const body = sprite.body as Phaser.Physics.Arcade.Body;
                if (body) {
                    body.setVelocityY(this.speed * 32);
                }
                if (sprite.y > GAME_HEIGHT + 80) {
                    sprite.destroy();
                }
            });
        }

        if (this.scenery && typeof this.scenery.getChildren === 'function') {
            this.scenery.getChildren().forEach((child) => {
                const obj = child as Phaser.GameObjects.Image;
                if (!obj || !obj.active) return;
                obj.y += this.speed * dt * 32;
                if (obj.y > GAME_HEIGHT + 80) {
                    obj.destroy();
                }
            });
        }
    }

    private checkNearMisses() {
        if (!this.traffic || typeof this.traffic.getChildren !== 'function') return;
        this.traffic.getChildren().forEach((child) => {
            const sprite = child as Phaser.Physics.Arcade.Sprite;
            if (!sprite || !sprite.active || sprite.getData('nearMissChecked')) return;

            const dx = Math.abs(sprite.x - this.player.x);
            const dy = Math.abs(sprite.y - this.player.y);

            if (dy < 45 && dx < 50 && dx > 20) {
                sprite.setData('nearMissChecked', true);
                this.nearMissStreak++;
                this.nearMissCount++;
                this.multiplier = Math.min(5, 1 + this.nearMissStreak * 0.5);

                const bonusPoints = Math.floor(100 * this.multiplier);
                this.score += bonusPoints;

                const cheerTexts = [
                    'SHARP GUY! ⚡',
                    'NO SHAKING! 🔥',
                    'LAGOS MASTER! 🚕',
                    'OGA AT WHEEL! 👑',
                    'DANFO SPEED! 💨',
                    'KING OF ROAD! 🏆',
                ];
                const text = cheerTexts[Math.min(this.nearMissStreak - 1, cheerTexts.length - 1)];
                EventBus.emit(EVT_NEAR_MISS, { points: bonusPoints, text });

                this.cameras.main.shake(80, 0.005);
                this.tweens.add({
                    targets: this.player,
                    scaleX: 1.15,
                    scaleY: 1.15,
                    yoyo: true,
                    duration: 120,
                });

                if (this.cache.audio.exists('sfx_powerup')) {
                    this.sound.play('sfx_powerup', { volume: 0.35 });
                }
            }
        });
    }

    private handleCrash(target: Phaser.Physics.Arcade.Sprite) {
        this.lives--;
        this.nearMissStreak = 0;
        this.multiplier = 1;
        this.invincible = true;
        this.invincibleTimer = 2.2;
        this.speed = Math.max(2.5, this.speed - 3);

        if (this.cache.audio.exists('sfx_hit')) {
            this.sound.play('sfx_hit', { volume: 0.75 });
        }

        this.cameras.main.shake(250, 0.025);
        this.spawnSparks(this.player.x, this.player.y);

        target.destroy();

        if (this.lives <= 0) {
            this.gameOver();
        }
    }

    private handleHazard(target: Phaser.Physics.Arcade.Sprite) {
        const key = target.getData('type') as string;
        if (key === 'pothole_hazard') {
            this.speed = Math.max(2.2, this.speed - 3.2);
            this.fuel = Math.max(0, this.fuel - 6);
            this.nearMissStreak = 0;
            this.multiplier = 1;
            this.tweens.add({
                targets: this.player,
                x: this.player.x + (Math.random() < 0.5 ? -18 : 18),
                duration: 100,
                yoyo: true,
                repeat: 2,
            });
            if (this.cache.audio.exists('sfx_hit')) {
                this.sound.play('sfx_hit', { volume: 0.4 });
            }
        } else if (key === 'traffic_light_red') {
            this.speed = Math.max(1.8, this.speed - 4);
            this.fuel = Math.max(0, this.fuel - 4);
            this.cameras.main.shake(150, 0.01);
            if (this.cache.audio.exists('sfx_hit')) {
                this.sound.play('sfx_hit', { volume: 0.5 });
            }
        } else {
            this.lives--;
            this.invincible = true;
            this.invincibleTimer = 1.8;
            this.cameras.main.shake(200, 0.02);
            if (this.cache.audio.exists('sfx_hit')) {
                this.sound.play('sfx_hit', { volume: 0.6 });
            }
        }

        target.destroy();
        if (this.lives <= 0) {
            this.gameOver();
        }
    }

    private handleCollect(target: Phaser.Physics.Arcade.Sprite) {
        const type = target.getData('type') as string;
        if (type === 'coin_naira') {
            this.score += Math.floor(150 * this.multiplier);
            if (this.cache.audio.exists('sfx_collect')) {
                this.sound.play('sfx_collect', { volume: 0.55 });
            }
        } else if (type === 'fuel_can') {
            this.fuel = Math.min(100, this.fuel + 30);
            if (this.cache.audio.exists('sfx_powerup')) {
                this.sound.play('sfx_powerup', { volume: 0.6 });
            }
        } else if (type === 'nitro_can') {
            this.nitroActive = true;
            this.nitroTimer = 3.5;
            if (this.cache.audio.exists('sfx_powerup')) {
                this.sound.play('sfx_powerup', { volume: 0.75 });
            }
        }

        this.tweens.add({
            targets: target,
            scaleX: 1.6,
            scaleY: 1.6,
            alpha: 0,
            duration: 150,
            onComplete: () => target.destroy(),
        });
    }

    private spawnSparks(x: number, y: number) {
        for (let i = 0; i < 10; i++) {
            const p = this.scenery.create(x, y, 'spark_particle') as Phaser.GameObjects.Image;
            if (!p) continue;
            p.setDepth(25).setScale(0.4 + Math.random() * 0.4);
            const angle = Math.random() * Math.PI * 2;
            const dist = 30 + Math.random() * 60;
            this.tweens.add({
                targets: p,
                x: x + Math.cos(angle) * dist,
                y: y + Math.sin(angle) * dist,
                alpha: 0,
                scaleX: 0,
                scaleY: 0,
                duration: 400 + Math.random() * 300,
                onComplete: () => p.destroy(),
            });
        }
    }

    public startCountdown() {
        if (this.phase !== 'MENU' && this.phase !== 'FINISHED' && this.phase !== 'PAUSED') return;
        this.phase = 'COUNTDOWN';
        EventBus.emit(EVT_PHASE_CHANGED, 'COUNTDOWN');
        this.countdownValue = 3;

        if (this.countdownTimer) {
            this.countdownTimer.remove();
        }

        const doTick = () => {
            EventBus.emit('countdown-tick', this.countdownValue);
            if (this.cache.audio.exists('sfx_button')) {
                this.sound.play('sfx_button', { volume: 0.5 });
            }

            if (this.countdownValue <= 0) {
                this.phase = 'PLAYING';
                EventBus.emit(EVT_PHASE_CHANGED, 'PLAYING');
                audioEngine.start();
                return;
            }
            this.countdownValue--;
            this.countdownTimer = this.time.delayedCall(750, doTick);
        };
        doTick();
    }

    public togglePause() {
        if (this.phase === 'PLAYING') {
            this.phase = 'PAUSED';
            this.physics.world.pause();
            this.tweens.pauseAll();
            audioEngine.stop();
            EventBus.emit(EVT_PHASE_CHANGED, 'PAUSED');
        } else if (this.phase === 'PAUSED') {
            this.phase = 'PLAYING';
            this.physics.world.resume();
            this.tweens.resumeAll();
            audioEngine.start();
            EventBus.emit(EVT_PHASE_CHANGED, 'PLAYING');
        }
    }

    private gameOver() {
        this.phase = 'FINISHED';
        audioEngine.stop();
        if (this.cache.audio.exists('sfx_gameover')) {
            this.sound.play('sfx_gameover', { volume: 0.7 });
        }

        const finalScore = Math.floor(this.score);
        if (finalScore > this.highScore) {
            this.highScore = finalScore;
            localStorage.setItem('danfo_frenzy_lagos_highscore', String(this.highScore));
        }

        EventBus.emit(EVT_PHASE_CHANGED, 'FINISHED');
        EventBus.emit(EVT_SCORE_UPDATED, {
            score: finalScore,
            distance: Math.floor(this.distance),
            multiplier: this.multiplier,
            speed: 0,
            fuel: 0,
            lives: this.lives,
            nearMissCount: this.nearMissCount,
        });
    }

    public restartGame() {
        if (this.countdownTimer) {
            this.countdownTimer.remove();
            this.countdownTimer = null;
        }

        if (this.traffic) this.traffic.clear(true, true);
        if (this.hazards) this.hazards.clear(true, true);
        if (this.collectibles) this.collectibles.clear(true, true);
        if (this.scenery) this.scenery.clear(true, true);

        this.score = 0;
        this.distance = 0;
        this.speed = 4;
        this.targetSpeed = 4;
        this.fuel = 100;
        this.lives = 3;
        this.multiplier = 1;
        this.nearMissCount = 0;
        this.nearMissStreak = 0;
        this.difficulty = 1;
        this.invincible = false;
        this.nitroActive = false;
        this.spawnTimer = 1.0;
        this.hazardTimer = 2.5;
        this.collectTimer = 1.5;

        this.player.setPosition(LANES[1], GAME_HEIGHT - 140);
        this.player.setAlpha(1);
        this.player.rotation = 0;

        this.startCountdown();
    }

    public returnToMenu() {
        if (this.countdownTimer) {
            this.countdownTimer.remove();
            this.countdownTimer = null;
        }

        if (this.traffic) this.traffic.clear(true, true);
        if (this.hazards) this.hazards.clear(true, true);
        if (this.collectibles) this.collectibles.clear(true, true);
        if (this.scenery) this.scenery.clear(true, true);

        this.score = 0;
        this.distance = 0;
        this.speed = 4;
        this.targetSpeed = 4;
        this.fuel = 100;
        this.lives = 3;
        this.multiplier = 1;
        this.nearMissCount = 0;
        this.nearMissStreak = 0;
        this.difficulty = 1;
        this.invincible = false;
        this.nitroActive = false;
        this.spawnTimer = 1.0;
        this.hazardTimer = 2.5;
        this.collectTimer = 1.5;

        this.player.setPosition(LANES[1], GAME_HEIGHT - 140);
        this.player.setAlpha(1);
        this.player.rotation = 0;

        audioEngine.stop();
        this.phase = 'MENU';
        EventBus.emit(EVT_PHASE_CHANGED, 'MENU');
    }

    public honkHorn() {
        if (this.honkCooldown > 0 || this.phase !== 'PLAYING') return;
        this.honkCooldown = 0.8;
        audioEngine.honk();

        if (this.traffic && typeof this.traffic.getChildren === 'function') {
            this.traffic.getChildren().forEach((child) => {
                const sprite = child as Phaser.Physics.Arcade.Sprite;
                if (!sprite || !sprite.active) return;
                const dy = this.player.y - sprite.y;
                const dx = Math.abs(sprite.x - this.player.x);
                if (dy > 0 && dy < 160 && dx < 90) {
                    const body = sprite.body as Phaser.Physics.Arcade.Body;
                    if (body) {
                        body.setVelocityY(body.velocity.y * 0.4);
                    }
                    sprite.setTint(0xFFFFAA);
                    this.time.delayedCall(300, () => {
                        if (sprite.active) sprite.clearTint();
                    });
                }
            });
        }
    }

    public setTouchLeft(val: boolean) { this.touchLeft = val; }
    public setTouchRight(val: boolean) { this.touchRight = val; }
    public setTouchNitro(val: boolean) { this.touchNitro = val; }
    public setTouchBrake(val: boolean) { this.touchBrake = val; }

    shutdown() {
        EventBus.removeListener(EVT_START_GAME);
        EventBus.removeListener(EVT_PAUSE_GAME);
        EventBus.removeListener(EVT_RESUME_GAME);
        EventBus.removeListener(EVT_RESTART_GAME);
        EventBus.removeListener(EVT_RETURN_TO_MENU);
        EventBus.removeListener(EVT_TRIGGER_HONK);
        if (this.input.keyboard) {
            this.input.keyboard.removeAllListeners();
        }
        this.tweens.killAll();
        audioEngine.stop();
    }
}

// ---------------------------------------------------------------------------
// GAME FACTORY
// ---------------------------------------------------------------------------
const StartGame = (parent: string) => {
    const config: Phaser.Types.Core.GameConfig = {
        type: AUTO,
        width: GAME_WIDTH,
        height: GAME_HEIGHT,
        parent,
        backgroundColor: '#10141a',
        scale: {
            mode: Scale.FIT,
            autoCenter: Scale.CENTER_BOTH,
        },
        physics: {
            default: 'arcade',
            arcade: {
                gravity: { x: 0, y: 0 },
                debug: false,
            },
        },
        scene: [Game],
    };
    const game = new PhaserGame(config);
    if (typeof window !== 'undefined') {
        (window as unknown as { __PHASER_GAME__: Phaser.Game }).__PHASER_GAME__ = game;
        (window as unknown as { __PHASER_EVENT_BUS__: Events.EventEmitter }).__PHASER_EVENT_BUS__ = EventBus;
    }
    return game;
};

export default StartGame;
import { useLayoutEffect, useRef, useState, useEffect, useCallback } from 'react';
import StartGame, {
    EventBus,
    Game,
    EVT_PHASE_CHANGED,
    EVT_SCENE_READY,
    EVT_SCORE_UPDATED,
    EVT_NEAR_MISS,
    EVT_START_GAME,
    EVT_PAUSE_GAME,
    EVT_RESUME_GAME,
    EVT_RESTART_GAME,
    EVT_TRIGGER_HONK,
    EVT_RETURN_TO_MENU,
    audioEngine,
} from './game/main';

export interface IRefPhaserGame {
    game: Phaser.Game | null;
    scene: Phaser.Scene | null;
}

interface HUDData {
    score: number;
    distance: number;
    multiplier: number;
    speed: number;
    fuel: number;
    lives: number;
    nearMissCount: number;
}

type GamePhase = 'MENU' | 'COUNTDOWN' | 'PLAYING' | 'PAUSED' | 'FINISHED';

const HS_KEY = 'danfo_frenzy_lagos_highscore';
const HS_KEY_LEGACY = 'nigeria_traffic_dash_highscore';

function readHighScore(): number {
    try {
        return parseInt(
            localStorage.getItem(HS_KEY) || localStorage.getItem(HS_KEY_LEGACY) || '0', 10
        );
    } catch {
        return 0;
    }
}

function getLagosRank(distance: number): { title: string; subtitle: string; icon: string } {
    if (distance < 600) return { title: 'Learner Driver', subtitle: 'You never enter Third Mainland Bridge!', icon: '🔰' };
    if (distance < 1600) return { title: 'Okada Champion', subtitle: 'Zipping through traffic like a pro!', icon: '🛵' };
    if (distance < 3200) return { title: 'Danfo Conductor', subtitle: 'Owa! Obalende straight!', icon: '🚐' };
    if (distance < 5500) return { title: 'Keke Racer', subtitle: 'No go area for road safety!', icon: '🛺' };
    if (distance < 8500) return { title: 'Lagos Traffic King', subtitle: 'Full Lagos expressway master!', icon: '👑' };
    return { title: 'King of the Mainland', subtitle: 'Immortal Lagos Street Legend!', icon: '🏆' };
}

function buildShareText(score: number, distance: number, rank: { title: string }): string {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    return `🚖 I scored ₦${score.toLocaleString()} (${distance}m) as a ${rank.title} in Danfo Frenzy: Lagos! 💥 Can you beat my high score on Third Mainland Bridge? Play now: ${url}`;
}

function App() {
    const phaserRef = useRef<IRefPhaserGame | null>(null);
    const [phase, setPhase] = useState<GamePhase>('MENU');
    const [hud, setHud] = useState<HUDData>({
        score: 0,
        distance: 0,
        multiplier: 1,
        speed: 0,
        fuel: 100,
        lives: 3,
        nearMissCount: 0,
    });
    const [nearMiss, setNearMiss] = useState<{ points: number; text: string } | null>(null);
    const [countdown, setCountdown] = useState(3);
    const [muted, setMuted] = useState(false);
    const [highScore, setHighScore] = useState(() => readHighScore());
    const [showRules, setShowRules] = useState(false);
    const [copyToast, setCopyToast] = useState(false);

    useLayoutEffect(() => {
        if (phaserRef.current === null) {
            const game = StartGame('game-container');
            phaserRef.current = { game, scene: null };
        }

        const sceneHandler = (scene: Phaser.Scene) => {
            if (phaserRef.current) {
                phaserRef.current.scene = scene;
            }
        };
        EventBus.on(EVT_SCENE_READY, sceneHandler);

        return () => {
            EventBus.removeListener(EVT_SCENE_READY, sceneHandler);
            if (phaserRef.current) {
                phaserRef.current.game?.destroy(true);
                phaserRef.current = null;
            }
        };
    }, []);

    useEffect(() => {
        const phaseHandler = (p: string) => {
            setPhase(p as GamePhase);
            if (p === 'FINISHED' || p === 'PLAYING') {
                setShowRules(false);
            }
        };
        const scoreHandler = (data: HUDData) => setHud(data);
        const missHandler = (data: { points: number; text: string }) => {
            setNearMiss(data);
            const t = setTimeout(() => setNearMiss(null), 1200);
            return () => clearTimeout(t);
        };
        const countHandler = (val: number) => setCountdown(val);

        EventBus.on(EVT_PHASE_CHANGED, phaseHandler);
        EventBus.on(EVT_SCORE_UPDATED, scoreHandler);
        EventBus.on(EVT_NEAR_MISS, missHandler);
        EventBus.on('countdown-tick', countHandler);

        return () => {
            EventBus.removeListener(EVT_PHASE_CHANGED, phaseHandler);
            EventBus.removeListener(EVT_SCORE_UPDATED, scoreHandler);
            EventBus.removeListener(EVT_NEAR_MISS, missHandler);
            EventBus.removeListener('countdown-tick', countHandler);
        };
    }, []);

    const onStart = () => {
        setShowRules(false);
        EventBus.emit(EVT_START_GAME);
    };

    const onPause = () => {
        EventBus.emit(EVT_PAUSE_GAME);
    };

    const onResume = () => {
        EventBus.emit(EVT_RESUME_GAME);
    };

    const onRestart = () => {
        setHighScore(readHighScore());
        setShowRules(false);
        EventBus.emit(EVT_RESTART_GAME);
    };

    const onMainMenu = () => {
        setHighScore(readHighScore());
        setShowRules(false);
        EventBus.emit(EVT_RETURN_TO_MENU);
    };

    useEffect(() => {
        if (phase !== 'FINISHED') return;
        const handler = (e: KeyboardEvent) => {
            if (e.code === 'Space' || e.code === 'Enter' || e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                onRestart();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [phase]);

    const onHonk = (e?: React.SyntheticEvent) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        EventBus.emit(EVT_TRIGGER_HONK);
    };

    const toggleMute = () => {
        setMuted(audioEngine.toggleMute());
    };

    const getScene = (): Game | null => {
        return (phaserRef.current?.scene as Game) || null;
    };

    // --- Social Sharing ---
    const rank = getLagosRank(hud.distance);
    const shareText = useCallback(() => buildShareText(hud.score, hud.distance, rank), [hud.score, hud.distance, rank]);

    const shareNative = useCallback(async () => {
        const text = shareText();
        if (navigator.share) {
            try {
                await navigator.share({ title: 'Danfo Frenzy: Lagos', text });
            } catch {
                // User cancelled
            }
        }
    }, [shareText]);

    const shareWhatsApp = useCallback(() => {
        const text = shareText();
        window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
    }, [shareText]);

    const shareX = useCallback(() => {
        const text = shareText();
        window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, '_blank');
    }, [shareText]);

    const copyToClipboard = useCallback(async () => {
        const text = shareText();
        try {
            await navigator.clipboard.writeText(text);
            setCopyToast(true);
            setTimeout(() => setCopyToast(false), 2500);
        } catch {
            // Fallback for older browsers
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            setCopyToast(true);
            setTimeout(() => setCopyToast(false), 2500);
        }
    }, [shareText]);

    const hasNativeShare = typeof navigator !== 'undefined' && !!navigator.share;

    return (
        <div id="app">
            <div id="game-container" />

            {/* LIVE HUD OVERLAY - Visible during PLAYING */}
            {phase === 'PLAYING' && (
                <div className="hud">
                    {/* Top Bar Stats */}
                    <div className="hud-top">
                        <div className="hud-stat-box score-box">
                            <span className="stat-label">NAIRA</span>
                            <span className="stat-value gold-glow">₦{hud.score.toLocaleString()}</span>
                        </div>
                        <div className="hud-stat-box distance-box">
                            <span className="stat-label">DISTANCE</span>
                            <span className="stat-value cyan-glow">{hud.distance}m</span>
                        </div>
                        <div className="hud-stat-box speed-box">
                            <span className="stat-label">SPEED</span>
                            <span className="stat-value green-glow">{hud.speed} km/h</span>
                        </div>
                        <button className="hud-pause-btn" onClick={onPause} title="Pause Game">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                                <rect x="5" y="4" width="4" height="16" rx="1" />
                                <rect x="15" y="4" width="4" height="16" rx="1" />
                            </svg>
                        </button>
                    </div>

                    {/* Multiplier Badge */}
                    {hud.multiplier > 1 && (
                        <div className="hud-multiplier">
                            <span className="multiplier-badge">🔥 {hud.multiplier.toFixed(1)}x COMBO!</span>
                        </div>
                    )}

                    {/* Near Miss Toast */}
                    {nearMiss && (
                        <div className="near-miss-popup">
                            <div className="near-miss-text">{nearMiss.text}</div>
                            <div className="near-miss-points">+₦{nearMiss.points} OVERTAKE!</div>
                        </div>
                    )}

                    {/* Bottom Status & Fuel */}
                    <div className="hud-bottom">
                        <div className="fuel-gauge-container">
                            <div className="fuel-gauge-track">
                                <div
                                    className={`fuel-gauge-fill ${hud.fuel < 25 ? 'fuel-critical' : ''}`}
                                    style={{ width: `${Math.max(0, Math.min(100, hud.fuel))}%` }}
                                />
                            </div>
                            <div className="fuel-label-row">
                                <span className="fuel-text">⛽ FUEL</span>
                                <span className="fuel-pct">{hud.fuel}%</span>
                            </div>
                        </div>

                        <div className="lives-display">
                            {Array.from({ length: 3 }).map((_, i) => (
                                <span key={i} className={`life-icon ${i < hud.lives ? 'active' : 'lost'}`}>
                                    🚗
                                </span>
                            ))}
                        </div>
                    </div>

                    {/* On-screen Touch Controls (for mobile & touchscreens) */}
                    <div className="touch-controls-layer">
                        <div className="touch-steer-row">
                            <button
                                className="touch-steer-btn steer-left"
                                onPointerDown={() => getScene()?.setTouchLeft(true)}
                                onPointerUp={() => getScene()?.setTouchLeft(false)}
                                onPointerLeave={() => getScene()?.setTouchLeft(false)}
                            >
                                ◀
                            </button>
                            <button
                                className="touch-steer-btn steer-right"
                                onPointerDown={() => getScene()?.setTouchRight(true)}
                                onPointerUp={() => getScene()?.setTouchRight(false)}
                                onPointerLeave={() => getScene()?.setTouchRight(false)}
                            >
                                ▶
                            </button>
                        </div>
                        <div className="touch-action-row">
                            <button
                                className="touch-action-btn brake-btn"
                                onPointerDown={() => getScene()?.setTouchBrake(true)}
                                onPointerUp={() => getScene()?.setTouchBrake(false)}
                                onPointerLeave={() => getScene()?.setTouchBrake(false)}
                            >
                                🛑 BRAKE
                            </button>
                            <button
                                className="touch-action-btn honk-btn"
                                onPointerDown={onHonk}
                                onClick={onHonk}
                            >
                                📢 HONK
                            </button>
                            <button
                                className="touch-action-btn nitro-btn"
                                onPointerDown={() => getScene()?.setTouchNitro(true)}
                                onPointerUp={() => getScene()?.setTouchNitro(false)}
                                onPointerLeave={() => getScene()?.setTouchNitro(false)}
                            >
                                ⚡ NITRO
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MAIN MENU OVERLAY */}
            {phase === 'MENU' && (
                <div className="overlay menu-overlay">
                    <div className="menu-card">
                        <div className="flag-banner">
                            <span className="flag-stripe green"></span>
                            <span className="flag-stripe white"></span>
                            <span className="flag-stripe green"></span>
                        </div>

                        <h1 className="game-title">
                            <span className="title-top">LAGOS STREETS</span>
                            <span className="title-mid">DANFO</span>
                            <span className="title-bot">FRENZY: LAGOS 🚐⚡</span>
                        </h1>

                        <p className="subtitle">Lagos Expressway Traffic Runner</p>

                        {highScore > 0 && (
                            <div className="high-score-badge">
                                <span className="trophy-icon">🏆</span> Best: <strong>₦{highScore.toLocaleString()}</strong>
                            </div>
                        )}

                        <button className="primary-action-btn start-dash-btn" onClick={onStart}>
                            START DASH 🚀
                        </button>

                        <button className="secondary-btn rules-toggle-btn" onClick={() => setShowRules(!showRules)}>
                            {showRules ? 'Hide Rules ✕' : 'How to Play & Street Rules ℹ️'}
                        </button>

                        {showRules && (
                            <div className="rules-modal">
                                <h3>🇳🇬 LAGOS STREET RULES:</h3>
                                <ul>
                                    <li><strong>◀ / ▶ or A / D:</strong> Weave between traffic lanes.</li>
                                    <li><strong>▲ or W:</strong> Accelerate & activate Nitro!</li>
                                    <li><strong>▼ or S:</strong> Brake to avoid sudden red lights.</li>
                                    <li><strong>SPACE or H:</strong> Blast Horn (GBAM!) to clear Okadas.</li>
                                    <li><strong>Near Misses:</strong> Overtake close to build huge ₦ multipliers!</li>
                                    <li><strong>Pickups:</strong> Grab Fuel ⛽, Cash ₦, and Nitro ⚡.</li>
                                    <li><strong>Hazards:</strong> Avoid Potholes, Stalls, and Red Lights.</li>
                                </ul>
                            </div>
                        )}

                        {/* Share section on Main Menu */}
                        <div className="share-section">
                            <span className="share-label">Challenge Friends</span>
                            <div className="share-btn-group">
                                {hasNativeShare && (
                                    <button className="share-btn native-share-btn" onClick={shareNative} title="Share">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                                            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                                        </svg>
                                        Share
                                    </button>
                                )}
                                <button className="share-btn whatsapp-btn" onClick={shareWhatsApp} title="Share on WhatsApp">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.352-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.821.932 5.456 2.649 7.538L.042 21.793l2.445-.642a11.833 11.833 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                                    </svg>
                                    WhatsApp
                                </button>
                                <button className="share-btn x-btn" onClick={shareX} title="Share on X">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                                    </svg>
                                    X
                                </button>
                            </div>
                        </div>

                        <div className="tips-box">
                            <p className="tip-text">💡 <em>"Oga, honk your horn to make Okadas shift for road!"</em></p>
                        </div>

                        <button className="sound-toggle-btn" onClick={toggleMute} title="Toggle Audio">
                            {muted ? '🔇 Sound OFF' : '🔊 Afrobeats ON'}
                        </button>
                    </div>
                </div>
            )}

            {/* COUNTDOWN OVERLAY */}
            {phase === 'COUNTDOWN' && (
                <div className="overlay countdown-overlay">
                    <div className="countdown-box">
                        <div className="countdown-text">
                            {countdown > 0 ? countdown : 'OYA GO! 🚦'}
                        </div>
                        <div className="countdown-sub">Get Ready to Dash!</div>
                    </div>
                </div>
            )}

            {/* PAUSE OVERLAY */}
            {phase === 'PAUSED' && (
                <div className="overlay pause-overlay">
                    <div className="modal pause-modal">
                        <div className="pause-icon">⏸️</div>
                        <h2>TRAFFIC DON HOLD!</h2>
                        <p className="pause-sub">Go slow dey catch monkey.</p>
                        <div className="modal-btn-group">
                            <button className="primary-action-btn" onClick={onResume}>
                                RESUME DASH ▶
                            </button>
                            <button className="secondary-btn" onClick={onRestart}>
                                RESTART 🔄
                            </button>
                            <button className="danger-btn" onClick={onMainMenu}>
                                QUIT TO MENU 🏠
                            </button>
                        </div>
                        <button className="mute-link" onClick={toggleMute}>
                            {muted ? '🔇 Unmute Music' : '🔊 Mute Music'}
                        </button>
                    </div>
                </div>
            )}

            {/* GAME OVER (FINISHED) OVERLAY */}
            {phase === 'FINISHED' && (
                <div className="overlay gameover-overlay">
                    <div className="modal gameover-modal">
                        <div className="crash-header">
                            <span className="crash-icon">💥</span>
                            <h2 className="gameover-title">E DON HAPPEN!</h2>
                            <p className="crash-sub">Your car don pack for road!</p>
                        </div>

                        <div className="rank-award-card">
                            <span className="rank-icon">{rank.icon}</span>
                            <div className="rank-info">
                                <span className="rank-tag">LAGOS DRIVER RANK</span>
                                <h3 className="rank-title">{rank.title}</h3>
                                <p className="rank-sub">{rank.subtitle}</p>
                            </div>
                        </div>

                        <div className="stats-dashboard">
                            <div className="stat-card">
                                <span className="sc-label">TOTAL NAIRA</span>
                                <strong className="sc-val gold-text">₦{hud.score.toLocaleString()}</strong>
                            </div>
                            <div className="stat-card">
                                <span className="sc-label">DISTANCE</span>
                                <strong className="sc-val cyan-text">{hud.distance}m</strong>
                            </div>
                            <div className="stat-card">
                                <span className="sc-label">NEAR MISSES</span>
                                <strong className="sc-val orange-text">{hud.nearMissCount}</strong>
                            </div>
                            <div className="stat-card">
                                <span className="sc-label">HIGH SCORE</span>
                                <strong className="sc-val green-text">₦{highScore.toLocaleString()}</strong>
                            </div>
                        </div>

                        {hud.score >= highScore && highScore > 0 && (
                            <div className="new-highscore-toast">
                                🎉 NEW LAGOS RECORD SET! 🎉
                            </div>
                        )}

                        {/* Share Score & Challenge Friends */}
                        <div className="share-section">
                            <span className="share-label">Share Score & Challenge Friends</span>
                            <div className="share-btn-group">
                                {hasNativeShare && (
                                    <button className="share-btn native-share-btn" onClick={shareNative} title="Share">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                                            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                                        </svg>
                                        Share
                                    </button>
                                )}
                                <button className="share-btn whatsapp-btn" onClick={shareWhatsApp} title="Share on WhatsApp">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.352-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.821.932 5.456 2.649 7.538L.042 21.793l2.445-.642a11.833 11.833 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                                    </svg>
                                    WhatsApp
                                </button>
                                <button className="share-btn x-btn" onClick={shareX} title="Share on X">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                                    </svg>
                                    X
                                </button>
                                <button className="share-btn copy-btn" onClick={copyToClipboard} title="Copy to Clipboard">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                                        <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                                    </svg>
                                    Copy
                                </button>
                            </div>
                        </div>

                        <div className="modal-btn-group">
                            <button className="primary-action-btn restart-btn" onClick={onRestart}>
                                PLAY AGAIN 🔄
                            </button>
                            <button className="secondary-btn" onClick={onMainMenu}>
                                MAIN MENU 🏠
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Copy Toast Notification */}
            {copyToast && (
                <div className="share-toast">
                    Score & Link copied to clipboard! 📋🚀
                </div>
            )}
        </div>
    );
}

export default App;

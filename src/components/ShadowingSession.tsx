import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Pause, SkipForward, SkipBack, RefreshCw, Volume2, Globe, MessageSquare, Mic } from 'lucide-react';
import { ShadowData, Sentence } from '../lib/dataParser';
import { storage, ShadowAudio } from '../lib/storage';
import voicePresets from '../config/voicePresets.json';

interface ShadowingSessionProps {
    sessionData: ShadowData;
    presetIds: string[];
    globalConfig: {
        repeat: number;
        followDelayRatio: number;
        modelId: string;
    };
    sessionId: number;
    onFinish: () => void;
    isRecording?: boolean;
    onReadyToRecord?: () => Promise<boolean>;
}

export const ShadowingSession: React.FC<ShadowingSessionProps> = ({ sessionData, presetIds, globalConfig, sessionId, onFinish, isRecording, onReadyToRecord }) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentRepeat, setCurrentRepeat] = useState(0);
    const [currentVoiceIndex, setCurrentVoiceIndex] = useState(0);
    const [isWaiting, setIsWaiting] = useState(false);
    const [isStarting, setIsStarting] = useState(true);
    const [isWaitingForRecord, setIsWaitingForRecord] = useState(!!onReadyToRecord);
    const [isPrepared, setIsPrepared] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const timeoutRef = useRef<number | null>(null);
    const hasInitiated = useRef(false);

    const currentSentence = sessionData.sentences[currentIndex];

    // Handle initial countdown and recording start
    useEffect(() => {
        if (hasInitiated.current) return;
        hasInitiated.current = true;

        const initiate = async () => {
            if (onReadyToRecord) {
                // Wait for the screen transition (opacity transition in App.tsx) to settle
                await new Promise(r => setTimeout(r, 800));
                const success = await onReadyToRecord();
                if (!success) {
                    onFinish(); // If recording fails/cancelled, go back
                    return;
                }
            }
            setIsWaitingForRecord(false);
        };

        initiate();
    }, []);

    useEffect(() => {
        if (!isWaitingForRecord && isStarting && !isPrepared) {
            const timer = setTimeout(() => {
                setIsPrepared(true);
                setIsStarting(false);
            }, 1000);
            return () => clearTimeout(timer);
        }
    }, [isWaitingForRecord, isStarting, isPrepared]);

    const playSentence = async () => {
        if (isStarting || isWaitingForRecord || isPaused) return;

        if (!currentSentence) {
            onFinish();
            return;
        }

        const presetId = presetIds[currentVoiceIndex];
        const preset = voicePresets.find((p: any) => p.id === presetId);
        if (!preset) return;

        const voiceId = preset.voiceId;
        const speed = preset.speed ?? 1.0;
        const stability = currentSentence.stability ?? 0.5;
        const simBoost = preset.similarity_boost ?? 0.75;

        const audioId = `${sessionId}_${currentSentence.index}_${voiceId}_${globalConfig.modelId}_${speed}_${stability}_${simBoost}`;
        const audioData = await storage.getAudio(audioId);

        if (audioData) {
            const url = URL.createObjectURL(audioData.audioBlob);
            if (audioRef.current) {
                audioRef.current.src = url;
                audioRef.current.play();
                setIsPlaying(true);
                setIsWaiting(false);
            }
        }
    };

    const handleAudioEnd = () => {
        setIsPlaying(false);
        setIsWaiting(true);

        const audioDuration = audioRef.current?.duration || 0;
        const waitTime = audioDuration * globalConfig.followDelayRatio * 1000;

        if (!isPaused) {
            timeoutRef.current = setTimeout(() => {
                proceedNext();
            }, waitTime);
        }
    };

    const proceedNext = () => {
        setIsWaiting(false);
        if (currentRepeat < globalConfig.repeat - 1) {
            setCurrentRepeat(prev => prev + 1);
        } else {
            setCurrentRepeat(0);
            if (currentVoiceIndex < presetIds.length - 1) {
                setCurrentVoiceIndex(prev => prev + 1);
            } else {
                setCurrentVoiceIndex(0);
                if (currentIndex < sessionData.sentences.length - 1) {
                    setCurrentIndex(prev => prev + 1);
                } else {
                    onFinish();
                }
            }
        }
    };

    const togglePause = () => {
        if (isPaused) {
            setIsPaused(false);
            if (isPlaying) {
                audioRef.current?.play();
            } else if (isWaiting) {
                const audioDuration = audioRef.current?.duration || 0;
                const waitTime = audioDuration * globalConfig.followDelayRatio * 1000;
                timeoutRef.current = setTimeout(() => {
                    proceedNext();
                }, waitTime);
            } else {
                playSentence();
            }
        } else {
            setIsPaused(true);
            if (isPlaying) {
                audioRef.current?.pause();
            }
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
                timeoutRef.current = null;
            }
        }
    };

    useEffect(() => {
        if (!isStarting && !isPaused) {
            playSentence();
        }
        return () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        };
    }, [currentIndex, currentRepeat, currentVoiceIndex, isStarting, isPaused]);

    return (
        <div className="w-full flex flex-col gap-4 relative">
            <AnimatePresence>
                {(isStarting || isWaitingForRecord) && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 backdrop-blur-xl"
                    >
                        {!isWaitingForRecord && (
                            <motion.div
                                initial={{ scale: 0.9, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                className="text-center space-y-8"
                            >
                                <div className="space-y-4">
                                    <motion.div
                                        animate={{
                                            scale: [1, 1.05, 1],
                                            opacity: [0.8, 1, 0.8]
                                        }}
                                        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                                        className="text-6xl md:text-8xl font-black text-white tracking-tighter"
                                    >
                                        Listen & Repeat
                                    </motion.div>
                                    <p className="text-2xl md:text-3xl text-blue-400 font-bold tracking-widest uppercase">
                                        듣고 따라하세요
                                    </p>
                                </div>
                            </motion.div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* HUD */}
            <div className={`flex justify-between items-center text-[10px] md:text-xs text-slate-500 font-mono transition-opacity duration-500 ${isStarting ? 'opacity-0' : 'opacity-100'}`}>
                <div className="flex items-center gap-2">
                    <span className="bg-slate-800 px-3 py-1 rounded-full border border-slate-700">Sentence {currentIndex + 1}/{sessionData.sentences.length}</span>
                    <span className="bg-blue-500/10 text-blue-400 px-3 py-1 rounded-full border border-blue-500/20">Actor {currentVoiceIndex + 1}/{presetIds.length}</span>
                    <span className="bg-blue-500/5 text-slate-400 px-3 py-1 rounded-full border border-slate-700">Repeat {currentRepeat + 1}/{globalConfig.repeat}</span>
                </div>
                <div className="flex items-center gap-3">
                    {isRecording && (
                        <div className="flex items-center gap-1.5 text-rose-500 font-bold mr-2 animate-pulse">
                            <Mic className="w-3 h-3 fill-rose-500" />
                            <span>REC</span>
                        </div>
                    )}
                    <span className="hidden sm:inline">Current: {voicePresets.find(p => p.id === presetIds[currentVoiceIndex])?.name || 'Unknown'}</span>
                    <span>Speed: {voicePresets.find((p: any) => p.id === presetIds[currentVoiceIndex])?.speed || 1.0}x</span>
                </div>
            </div>

            <audio ref={audioRef} onEnded={handleAudioEnd} className="hidden" />

            {/* Main UI */}
            <div className="glass-card px-4 md:px-12 py-8 flex flex-col items-center text-center gap-6 relative overflow-hidden min-h-[350px] justify-center w-full">
                {/* Progress Background */}
                <div className="absolute inset-0 z-0 pointer-events-none opacity-20">
                    <div className={`absolute inset-0 bg-blue-500 transition-transform duration-[2000ms] ${isPlaying ? 'scale-110' : 'scale-100'}`} />
                </div>

                <motion.div
                    key={currentSentence?.english || 'loading'}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, ease: "easeOut" }}
                    className="z-10 space-y-6 w-full max-w-5xl mx-auto"
                >
                    <div className="space-y-4">
                        <h2 className="text-4xl md:text-5xl lg:text-7xl font-black text-white tracking-tight leading-tight drop-shadow-2xl">
                            {currentSentence?.english}
                        </h2>
                        <p className="text-xl md:text-2xl text-slate-400 font-medium">
                            {currentSentence?.korean}
                        </p>
                    </div>

                    <div className="min-h-[120px] flex flex-col items-center justify-center">
                        <AnimatePresence mode="wait">
                            {isWaiting ? (
                                <motion.div
                                    key="shadowing"
                                    initial={{ scale: 0.8, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    exit={{ scale: 1.1, opacity: 0 }}
                                    className="flex flex-col items-center gap-2 text-blue-400"
                                >
                                    <Mic className="w-12 h-12 animate-pulse" />
                                    <span className="text-sm font-black tracking-[0.3em] uppercase">Repeat</span>
                                </motion.div>
                            ) : (
                                <motion.div
                                    key="listening"
                                    initial={{ scale: 0.8, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    exit={{ scale: 1.1, opacity: 0 }}
                                    className="flex flex-col items-center gap-2 text-slate-400"
                                >
                                    <Volume2 className="w-12 h-12" />
                                    <span className="text-sm font-black tracking-[0.3em] uppercase">Listen</span>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </motion.div>
            </div>

            {/* Words List */}
            <div className="flex flex-wrap justify-center gap-2 transition-all duration-500">
                {currentSentence.words.map((word, idx) => (
                    <motion.div
                        key={idx}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: idx * 0.05 }}
                        className="bg-slate-800/40 border border-slate-700/50 px-3 py-1.5 rounded-full flex items-center gap-3 group hover:bg-slate-800 transition-colors"
                    >
                        <div className="flex items-baseline gap-2">
                            <span className="font-bold text-white group-hover:text-blue-400 transition-colors">{word.term}</span>
                            <span className="text-xs text-slate-400 whitespace-nowrap">{word.meaning}</span>
                        </div>
                        <div className="flex gap-0.5">
                            {[1, 2, 3].map(d => (
                                <div key={d} className={`w-1 h-1 rounded-full ${d <= word.difficulty ? 'bg-blue-500' : 'bg-slate-700'}`} />
                            ))}
                        </div>
                    </motion.div>
                ))}
            </div>

            {/* Controls */}
            <div className={`flex justify-center items-center gap-8 py-4 transition-all duration-500 ${isRecording ? 'opacity-0 pointer-events-none translate-y-4' : 'opacity-100'}`}>
                <button
                    onClick={() => {
                        setCurrentIndex(Math.max(0, currentIndex - 1));
                        setCurrentVoiceIndex(0);
                        setCurrentRepeat(0);
                    }}
                    className="p-4 rounded-full bg-slate-800 text-slate-400 hover:text-white transition-colors"
                >
                    <SkipBack className="w-6 h-6" />
                </button>

                <button
                    onClick={togglePause}
                    className="p-6 rounded-full bg-blue-500 text-white hover:bg-blue-400 transition-all transform hover:scale-110 active:scale-95 shadow-lg shadow-blue-500/20"
                >
                    {isPaused ? <Play className="w-8 h-8 fill-current" /> : <Pause className="w-8 h-8 fill-current" />}
                </button>

                <button
                    onClick={() => {
                        setCurrentIndex(Math.min(sessionData.sentences.length - 1, currentIndex + 1));
                        setCurrentVoiceIndex(0);
                        setCurrentRepeat(0);
                    }}
                    className="p-4 rounded-full bg-slate-800 text-slate-400 hover:text-white transition-colors"
                >
                    <SkipForward className="w-6 h-6" />
                </button>
            </div>
        </div>
    );
};

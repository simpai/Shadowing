export class ScreenRecorder {
    private mediaRecorder: MediaRecorder | null = null;
    private chunks: Blob[] = [];
    private stream: MediaStream | null = null;
    private micStream: MediaStream | null = null;
    private audioContext: AudioContext | null = null;
    private audioDestination: MediaStreamAudioDestinationNode | null = null;
    private registeredElements: Set<HTMLMediaElement> = new Set();
    private isAutomation: boolean = false;

    setAutomationMode(val: boolean) {
        this.isAutomation = val;
        console.log(`[ScreenRecorder] Automation mode set to: ${val}`);
    }

    registerElement(element: HTMLMediaElement) {
        this.registeredElements.add(element);
        if (element.src && !element.src.startsWith('blob:') && !element.crossOrigin) {
            element.crossOrigin = 'anonymous';
        }
    }

    unregisterElement(element: HTMLMediaElement) {
        this.registeredElements.delete(element);
    }

    async start(isAutomationParam?: boolean) {
        try {
            const params = new URLSearchParams(window.location.search);
            const automationActive = isAutomationParam ?? this.isAutomation ?? (params.get('autoStart') === 'true');

            console.log(`[ScreenRecorder] Starting recording (Automation: ${automationActive})...`);

            // @ts-ignore
            const controller = new CaptureController();

            // 1. Get Display Media (Always request audio for protocol compatibility)
            const displayStream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    displaySurface: 'browser',
                    // @ts-ignore
                    cursor: 'never'
                },
                // @ts-ignore
                selfBrowserSurface: 'include',
                // @ts-ignore
                preferCurrentTab: true,
                // @ts-ignore
                surfaceSwitching: 'include',
                // @ts-ignore
                systemAudio: 'include',
                // @ts-ignore
                controller,
                audio: true
            });

            console.log("[ScreenRecorder] Display stream acquired. Video tracks:", displayStream.getVideoTracks().length, "Audio tracks:", displayStream.getAudioTracks().length);

            // 2. Mix Audio Sources
            if (!this.audioContext) this.audioContext = new AudioContext();
            this.audioDestination = this.audioContext.createMediaStreamDestination();

            // Handle System Audio Track
            displayStream.getAudioTracks().forEach((track: MediaStreamTrack) => {
                // We ALWAYS mute/disable the system track from getDisplayMedia.
                // Why? Because we capture the digital audio directly from the <audio> elements (3. Connect Media Elements).
                // If we also include this track, the user results in a double-echo effect in manual mode.
                console.log(`[ScreenRecorder] Disabling system audio track to prevent echo: ${track.label}`);
                track.enabled = false;
            });

            // 3. Connect Media Elements
            const allAudio = document.querySelectorAll('audio');
            const elementsToConnect = new Set([...Array.from(allAudio), ...Array.from(this.registeredElements)]);

            elementsToConnect.forEach(element => {
                try {
                    console.log(`[ScreenRecorder] Connecting element source: ${element.src.substring(0, 50)}`);
                    // Using createMediaElementSource is generally more stable for mixing than captureStream for <audio> tags
                    const source = this.audioContext!.createMediaElementSource(element);
                    source.connect(this.audioContext!.destination); // Keep local playback
                    source.connect(this.audioDestination!); // Record
                } catch (e) {
                    // This error is expected if an element is already connected to an AudioContext
                    console.debug("[ScreenRecorder] Element already connected or CORS restricted:", e);

                    // Fallback to captureStream if it exists (for some edge cases)
                    // @ts-ignore
                    if (typeof element.captureStream === 'function') {
                        // @ts-ignore
                        const stream = element.captureStream();
                        stream.getAudioTracks().forEach((t: MediaStreamTrack) => {
                            const s = this.audioContext!.createMediaStreamSource(new MediaStream([t]));
                            s.connect(this.audioDestination!);
                        });
                    }
                }
            });

            // 4. Get Microphone (User Voice) - ONLY if NOT automation
            if (!automationActive) {
                try {
                    this.micStream = await navigator.mediaDevices.getUserMedia({
                        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
                        video: false
                    });
                    const micSource = this.audioContext.createMediaStreamSource(this.micStream);
                    micSource.connect(this.audioDestination);
                    console.log("[ScreenRecorder] Microphone mixed into recording");
                } catch (err) {
                    console.warn("[ScreenRecorder] Mic access denied:", err);
                }
            } else {
                console.log("[ScreenRecorder] AGGRESSIVE: Microphone and System Audio completely excluded from recording pipeline.");
            }

            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }

            // 5. Build Final Stream with guaranteed structure
            const finalStream = new MediaStream();
            displayStream.getVideoTracks().forEach(t => finalStream.addTrack(t));
            this.audioDestination.stream.getAudioTracks().forEach(t => finalStream.addTrack(t));

            this.stream = finalStream;
            displayStream.getVideoTracks()[0].onended = () => this.stop();

            const types = ['video/webm;codecs=vp8,opus', 'video/webm;codecs=h264,opus', 'video/webm'];
            const mimeType = types.find(t => MediaRecorder.isTypeSupported(t)) || 'video/webm';

            console.log(`[ScreenRecorder] Initializing MediaRecorder with ${mimeType}`);
            this.mediaRecorder = new MediaRecorder(this.stream, {
                mimeType,
                videoBitsPerSecond: 3000000
            });

            this.mediaRecorder.onerror = (ev) => console.error("[ScreenRecorder] MediaRecorder error:", ev);

            this.chunks = [];
            this.mediaRecorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) {
                    this.chunks.push(e.data);
                }
            };

            await new Promise(r => setTimeout(r, 1000)); // Give Chrome time to settle the video surface

            this.mediaRecorder.start(1000);
            console.log("[ScreenRecorder] Recording started.", {
                finalAudioTracks: this.audioDestination.stream.getAudioTracks().length,
                videoTracks: displayStream.getVideoTracks().length
            });

            return true;
        } catch (err) {
            console.error('[ScreenRecorder] Failed to start:', err);
            return false;
        }
    }

    async stop(): Promise<Blob | null> {
        return new Promise((resolve) => {
            if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
                resolve(null);
                return;
            }

            this.mediaRecorder.onstop = () => {
                const blob = new Blob(this.chunks, { type: this.mediaRecorder?.mimeType || 'video/webm' });
                this.cleanup();
                resolve(blob);
            };

            this.mediaRecorder.stop();
        });
    }

    private cleanup() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
        if (this.micStream) {
            this.micStream.getTracks().forEach(track => track.stop());
            this.micStream = null;
        }
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }

        this.mediaRecorder = null;
        this.chunks = [];
    }

    saveRecording(blob: Blob, filename: string) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${filename}.webm`;
        a.click();
        URL.revokeObjectURL(url);
    }
}

export const screenRecorder = new ScreenRecorder();

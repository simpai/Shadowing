export class ScreenRecorder {
    private mediaRecorder: MediaRecorder | null = null;
    private chunks: Blob[] = [];
    private stream: MediaStream | null = null;
    private micStream: MediaStream | null = null;
    private audioContext: AudioContext | null = null;
    private audioDestination: MediaStreamAudioDestinationNode | null = null;

    async start() {
        try {
            // @ts-ignore
            const controller = new CaptureController();

            // 1. Get Display Media (Video + System Audio)
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

            // Set focus behavior
            try {
                // @ts-ignore
                if (typeof controller.setFocusBehavior === 'function') {
                    // @ts-ignore
                    controller.setFocusBehavior('focus-captured-surface');
                }
            } catch (e) { }

            // 2. Get Microphone Media (User Voice) - Optional
            let micStream: MediaStream | null = null;
            try {
                micStream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true
                    },
                    video: false
                });
            } catch (err) {
                console.warn("Microphone access denied or unavailable:", err);
            }

            // 3. Mix Audio Sources
            this.audioContext = new AudioContext();
            this.audioDestination = this.audioContext.createMediaStreamDestination();

            // Add System Audio
            if (displayStream.getAudioTracks().length > 0) {
                const sysSource = this.audioContext.createMediaStreamSource(displayStream);
                // Gain node for system audio volume control if needed
                const sysGain = this.audioContext.createGain();
                sysGain.gain.value = 1.0;
                sysSource.connect(sysGain).connect(this.audioDestination);
            }

            // Add Mic Audio
            if (micStream) {
                this.micStream = micStream;
                const micSource = this.audioContext.createMediaStreamSource(micStream);
                const micGain = this.audioContext.createGain();
                micGain.gain.value = 1.0; // Adjust user volume
                micSource.connect(micGain).connect(this.audioDestination);
            }

            // 4. Create Final Mixed Stream
            // Combine display video with mixed audio
            const mixedTracks = [
                ...displayStream.getVideoTracks(),
                ...this.audioDestination.stream.getAudioTracks()
            ];
            this.stream = new MediaStream(mixedTracks);

            // Handle independent track stopping (if display stream stops)
            displayStream.getVideoTracks()[0].onended = () => {
                this.stop();
            };

            // Select best MIME type
            const types = [
                'video/webm;codecs=vp8,opus',
                'video/webm;codecs=h264,opus',
                'video/webm'
            ];
            const mimeType = types.find(t => MediaRecorder.isTypeSupported(t)) || 'video/webm';

            this.mediaRecorder = new MediaRecorder(this.stream, {
                mimeType,
                videoBitsPerSecond: 3000000
            });

            this.chunks = [];
            this.mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    this.chunks.push(e.data);
                }
            };

            this.mediaRecorder.start(1000);

            // Keep stream alive
            const video = document.createElement('video');
            video.srcObject = this.stream;
            video.muted = true;
            video.play().catch(() => { });

            return true;
        } catch (err) {
            console.error('Failed to start recording:', err);
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
        // Stop all tracks in the main mixed stream
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
        // Specific cleanup for mic stream (as it might be separate)
        if (this.micStream) {
            this.micStream.getTracks().forEach(track => track.stop());
            this.micStream = null;
        }
        // Close AudioContext
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

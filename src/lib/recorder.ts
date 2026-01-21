export class ScreenRecorder {
    private mediaRecorder: MediaRecorder | null = null;
    private chunks: Blob[] = [];
    private stream: MediaStream | null = null;

    async start() {
        try {
            this.stream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    displaySurface: 'browser',
                    // @ts-ignore
                    cursor: 'never'
                },
                // @ts-ignore
                selfBrowserSurface: 'include',
                // @ts-ignore
                preferCurrentTab: true,
                audio: true
            });

            const mimeType = 'video/webm;codecs=vp9,opus';

            this.mediaRecorder = new MediaRecorder(this.stream, {
                mimeType,
                videoBitsPerSecond: 2500000
            });

            this.chunks = [];
            this.mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    this.chunks.push(e.data);
                }
            };

            // Using a timeslice (1000ms) helps ensure that the recording is properly 
            // chunked and reduces issues with missing metadata in WebM
            this.mediaRecorder.start(1000);

            this.stream.getVideoTracks()[0].onended = () => {
                this.stop();
            };

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
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
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

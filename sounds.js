// Sound Manager for Poker Game
class SoundManager {
    constructor() {
        this.audioContext = null;
        this.isMuted = false;
        this.masterVolume = 0.3;
        this.initAudioContext();
    }

    initAudioContext() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.warn('Web Audio API not supported');
        }
    }

    // Ensure audio context is running (needed for some browsers)
    resumeContext() {
        if (this.audioContext && this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
    }

    // Card dealing sound - quick swoosh
    playCardDeal() {
        if (this.isMuted || !this.audioContext) return;
        this.resumeContext();

        const now = this.audioContext.currentTime;

        // Create noise for swoosh effect
        const bufferSize = this.audioContext.sampleRate * 0.1;
        const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
        }

        const noise = this.audioContext.createBufferSource();
        noise.buffer = buffer;

        const filter = this.audioContext.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 800;

        const gainNode = this.audioContext.createGain();
        gainNode.gain.setValueAtTime(this.masterVolume * 0.3, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.1);

        noise.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(this.audioContext.destination);

        noise.start(now);
        noise.stop(now + 0.1);
    }

    // Chip/betting sound - poker chip clink
    playChipSound() {
        if (this.isMuted || !this.audioContext) return;
        this.resumeContext();

        const now = this.audioContext.currentTime;

        // Create multiple oscillators for rich chip sound
        const frequencies = [800, 1200, 1600];

        frequencies.forEach((freq, index) => {
            const osc = this.audioContext.createOscillator();
            osc.type = 'sine';
            osc.frequency.value = freq;

            const gainNode = this.audioContext.createGain();
            gainNode.gain.setValueAtTime(this.masterVolume * 0.15, now);
            gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.15);

            osc.connect(gainNode);
            gainNode.connect(this.audioContext.destination);

            osc.start(now + index * 0.02);
            osc.stop(now + 0.15 + index * 0.02);
        });
    }

    // Button click sound
    playClick() {
        if (this.isMuted || !this.audioContext) return;
        this.resumeContext();

        const now = this.audioContext.currentTime;

        const osc = this.audioContext.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = 800;

        const gainNode = this.audioContext.createGain();
        gainNode.gain.setValueAtTime(this.masterVolume * 0.2, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.05);

        osc.connect(gainNode);
        gainNode.connect(this.audioContext.destination);

        osc.start(now);
        osc.stop(now + 0.05);
    }

    // Winner celebration sound - triumphant fanfare
    playWinner() {
        if (this.isMuted || !this.audioContext) return;
        this.resumeContext();

        const now = this.audioContext.currentTime;

        // Play ascending notes for fanfare
        const notes = [523.25, 659.25, 783.99, 1046.50]; // C, E, G, C

        notes.forEach((freq, index) => {
            const osc = this.audioContext.createOscillator();
            osc.type = 'triangle';
            osc.frequency.value = freq;

            const gainNode = this.audioContext.createGain();
            const startTime = now + index * 0.15;
            gainNode.gain.setValueAtTime(this.masterVolume * 0.25, startTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + 0.3);

            osc.connect(gainNode);
            gainNode.connect(this.audioContext.destination);

            osc.start(startTime);
            osc.stop(startTime + 0.3);
        });
    }

    // Fold sound - soft dismissal
    playFold() {
        if (this.isMuted || !this.audioContext) return;
        this.resumeContext();

        const now = this.audioContext.currentTime;

        const osc = this.audioContext.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.exponentialRampToValueAtTime(200, now + 0.2);

        const gainNode = this.audioContext.createGain();
        gainNode.gain.setValueAtTime(this.masterVolume * 0.15, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.2);

        osc.connect(gainNode);
        gainNode.connect(this.audioContext.destination);

        osc.start(now);
        osc.stop(now + 0.2);
    }

    // Check/Call sound - confirmation beep
    playCheck() {
        if (this.isMuted || !this.audioContext) return;
        this.resumeContext();

        const now = this.audioContext.currentTime;

        const osc = this.audioContext.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = 600;

        const gainNode = this.audioContext.createGain();
        gainNode.gain.setValueAtTime(this.masterVolume * 0.2, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.1);

        osc.connect(gainNode);
        gainNode.connect(this.audioContext.destination);

        osc.start(now);
        osc.stop(now + 0.1);
    }

    // Raise sound - higher pitched chip sound
    playRaise() {
        if (this.isMuted || !this.audioContext) return;
        this.resumeContext();

        const now = this.audioContext.currentTime;

        // Similar to chip sound but higher pitch
        const frequencies = [1000, 1400, 1800];

        frequencies.forEach((freq, index) => {
            const osc = this.audioContext.createOscillator();
            osc.type = 'sine';
            osc.frequency.value = freq;

            const gainNode = this.audioContext.createGain();
            gainNode.gain.setValueAtTime(this.masterVolume * 0.2, now);
            gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.2);

            osc.connect(gainNode);
            gainNode.connect(this.audioContext.destination);

            osc.start(now + index * 0.03);
            osc.stop(now + 0.2 + index * 0.03);
        });
    }

    // Toggle mute
    toggleMute() {
        this.isMuted = !this.isMuted;
        return this.isMuted;
    }

    setMuted(muted) {
        this.isMuted = muted;
    }

    getMuted() {
        return this.isMuted;
    }
}

// Create global sound manager instance
window.soundManager = new SoundManager();

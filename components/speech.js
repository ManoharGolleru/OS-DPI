// speech.js
import * as sdk from "microsoft-cognitiveservices-speech-sdk";
import { TreeBase } from "./treebase";
import { html } from "uhtml";
import Globals from "app/globals";
import * as Props from "./props";

class Speech extends TreeBase {
  // Component properties
  stateName = new Props.String("$Speak");
  voiceURI = new Props.String("$VoiceURI", "en-US-DavisNeural");
  expressStyle = new Props.String("$ExpressStyle", "friendly");
  volume = new Props.Float(1.0);  // Volume range: 0.0 (mute) to 2.0 (+50dB)
  isSpeaking = false;
  startTime = null;

  constructor() {
    super();
    this.initSynthesizer();
  }

  logWithTimestamp(message) {
    console.log(`[${new Date().toISOString()}] ${message}`);
  }

  initSynthesizer() {
    this.speechConfig = sdk.SpeechConfig.fromSubscription(
      'c7d8e36fdf414cbaae05819919fd416d',
      'eastus'
    );

    this.speechConfig.speechSynthesisOutputFormat =
      sdk.SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3;

    this.audioConfig = sdk.AudioConfig.fromDefaultSpeakerOutput();
    
    this.synthesizer = new sdk.SpeechSynthesizer(
      this.speechConfig,
      this.audioConfig
    );

    // Event handlers for synthesis lifecycle
    this.synthesizer.synthesisStarted = (s, e) => {
      this.startTime = performance.now();
      this.logWithTimestamp("Synthesis started");
    };

    this.synthesizer.synthesisCompleted = (s, e) => {
      const latency = performance.now() - this.startTime;
      this.logWithTimestamp(`Synthesis completed in ${latency.toFixed(2)} ms`);
      this.cleanupAndReinit();
    };

    this.synthesizer.synthesisCanceled = (s, e) => {
      this.logWithTimestamp(`Canceled: ${e.reason}`);
      this.cleanupAndReinit();
    };
  }

  cleanupAndReinit() {
    this.isSpeaking = false;
    try {
      this.synthesizer.close();
    } catch (e) {
      this.logWithTimestamp(`Cleanup error: ${e}`);
    }
    this.initSynthesizer();
  }

  async speak() {
    if (this.isSpeaking) {
      this.logWithTimestamp("Canceling previous synthesis");
      this.cleanupAndReinit();
    }

    const { state } = Globals;
    const message = state.get(this.stateName.value);
    const voice = state.get(this.voiceURI.value) || "en-US-DavisNeural";
    const style = state.get(this.expressStyle.value) || "friendly";
    const rawVolume = state.get(this.volume.value) ?? 1.0;
    const volume = Math.min(Math.max(rawVolume, 0.0), 2.0);

    if (!message?.trim()) {
      this.logWithTimestamp("Empty message");
      return;
    }

    // Convert volume to dB scale (0.0-2.0 => -50dB to +50dB)
    const dB = (volume - 1) * 50;
    const volumeAttr = `${dB >= 0 ? '+' : ''}${dB.toFixed(1)}dB`;

    const ssml = `
<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" 
       xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="en-US">
  <voice name="${voice}">
    <mstts:express-as style="${style}">
      <prosody volume="${volumeAttr}">
        ${this.escapeSSML(message)}
      </prosody>
    </mstts:express-as>
  </voice>
</speak>`;

    try {
      this.isSpeaking = true;
      this.startTime = performance.now();
      
      const result = await this.synthesizer.speakSsmlAsync(ssml);
      
      if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
        const latency = performance.now() - this.startTime;
        this.logWithTimestamp(`Success in ${latency.toFixed(2)} ms`);
      } else {
        const details = sdk.SpeechSynthesisCancellationDetails.fromResult(result);
        this.logWithTimestamp(`Canceled: ${details.reason} (${details.errorDetails})`);
      }
    } catch (error) {
      this.logWithTimestamp(`Synthesis error: ${error}`);
    } finally {
      this.cleanupAndReinit();
    }
  }

  escapeSSML(text) {
    return text.replace(/&/g, "&amp;")
               .replace(/</g, "&lt;")
               .replace(/>/g, "&gt;")
               .replace(/"/g, "&quot;")
               .replace(/'/g, "&apos;");
  }

  disconnectedCallback() {
    if (this.isSpeaking) {
      this.cleanupAndReinit();
      this.logWithTimestamp("Stopped on component disconnect");
    }
  }

  template() {
    const { state } = Globals;
    if (state.hasBeenUpdated(this.stateName.value)) {
      this.speak();
    }
    return html`<div />`;
  }
}

TreeBase.register(Speech, "Speech");
export default Speech;

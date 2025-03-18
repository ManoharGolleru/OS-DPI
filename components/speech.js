// speech.js
import * as sdk from "microsoft-cognitiveservices-speech-sdk";
import { TreeBase } from "./treebase";
import { html } from "uhtml";
import Globals from "app/globals";
import * as Props from "./props";
import { Howl } from "howler"; // Ensure Howler.js is installed

/**
 * Speech component using Azure Speech SDK.
 * Synthesizes speech via Azure and plays the audio using Howler.js,
 * which provides robust volume control.
 */
class Speech extends TreeBase {
  // App properties
  stateName = new Props.String("$Speak");
  voiceURI = new Props.String("$VoiceURI", "en-US-DavisNeural"); // Default voice
  expressStyle = new Props.String("$ExpressStyle", "friendly");   // Default style
  volume = new Props.Float("$Volume", 1);                          // Volume: 0.0 (mute) to 1.0 (full)

  isSpeaking = false;
  startTime = null;

  constructor() {
    super();
    this.initSynthesizer();
  }

  logWithTimestamp(message) {
    console.log(`[${new Date().toISOString()}] ${message}`);
  }

  /**
   * Initializes the Azure Speech synthesizer without an audio config,
   * so playback is handled manually.
   */
  initSynthesizer() {
    // Replace these with your actual subscription key and region
    this.speechConfig = sdk.SpeechConfig.fromSubscription(
      'c7d8e36fdf414cbaae05819919fd416d',
      'eastus'
    );
    this.speechConfig.speechSynthesisOutputFormat =
      sdk.SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3;
    // Create synthesizer without an audio config
    this.synthesizer = new sdk.SpeechSynthesizer(this.speechConfig);
    this.synthesizer.synthesisStarted = (s, e) => {
      this.startTime = performance.now();
      this.logWithTimestamp("Synthesis started");
    };
    this.synthesizer.synthesisCompleted = (s, e) => {
      const latency = performance.now() - this.startTime;
      this.logWithTimestamp(`Synthesis completed in ${latency.toFixed(2)} ms`);
      this.isSpeaking = false;
      // Reinitialize synthesizer for next call
      this.initSynthesizer();
    };
    this.synthesizer.synthesisCanceled = (s, e) => {
      this.logWithTimestamp(`Synthesis canceled: ${e.reason}`);
      this.isSpeaking = false;
      this.initSynthesizer();
    };
  }

  /**
   * Initiates speech synthesis and plays the audio using Howler.js.
   * Howler.js will apply the desired volume to the output.
   */
  async speak() {
    if (this.isSpeaking) {
      this.logWithTimestamp("Cancelling current synthesis.");
      this.synthesizer.close();
      this.isSpeaking = false;
    }
    this.isSpeaking = true;

    const { state } = Globals;
    const message = state.get(this.stateName.value);
    const voice = state.get(this.voiceURI.value) || "en-US-DavisNeural";
    const style = state.get(this.expressStyle.value) || "friendly";
    const volValue = state.get(this.volume.value);
    
    // Log the volume for debugging
    this.logWithTimestamp(`Volume value from state: ${volValue}`);

    if (!message) {
      this.logWithTimestamp("No message to speak.");
      this.isSpeaking = false;
      return;
    }

    this.logWithTimestamp(
      `Synthesizing with voice: ${voice}, style: ${style}, volume: ${volValue}, message: ${message}`
    );

    // Build SSML (volume not set in SSML; we'll control playback volume)
    const ssml = `
      <speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="en-US">
        <voice name="${voice}">
          <mstts:express-as style="${style}">
            ${this.escapeSSML(message)}
          </mstts:express-as>
        </voice>
      </speak>`;

    try {
      this.startTime = performance.now();
      this.synthesizer.speakSsmlAsync(
        ssml,
        (result) => {
          const latency = performance.now() - this.startTime;
          if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
            this.logWithTimestamp(`Synthesis successful in ${latency.toFixed(2)} ms`);
            // Create a blob from the synthesized audio data
            const audioBlob = new Blob([result.audioData], { type: 'audio/mp3' });
            const url = URL.createObjectURL(audioBlob);
            // Use Howler.js to play the audio with the specified volume
            const sound = new Howl({
              src: [url],
              volume: volValue, // Howler volume: 0.0 (mute) to 1.0 (full)
              onend: () => {
                // Optionally revoke the object URL after playback ends
                URL.revokeObjectURL(url);
              }
            });
            sound.play();
          } else if (result.reason === sdk.ResultReason.Canceled) {
            const cancellationDetails = sdk.SpeechSynthesisCancellationDetails.fromResult(result);
            this.logWithTimestamp(`Synthesis canceled: ${cancellationDetails.reason}, ${cancellationDetails.errorDetails}`);
          }
          this.isSpeaking = false;
          this.initSynthesizer();
        },
        (error) => {
          this.logWithTimestamp(`Synthesis error: ${error}`);
          this.isSpeaking = false;
          this.initSynthesizer();
        }
      );
    } catch (error) {
      this.logWithTimestamp(`Error in speak method: ${error}`);
      this.isSpeaking = false;
      this.initSynthesizer();
    }
  }

  /**
   * Escapes special characters for safe SSML usage.
   * @param {string} text - Text to escape.
   * @returns {string} Escaped text.
   */
  escapeSSML(text) {
    return text.replace(/&/g, "&amp;")
               .replace(/</g, "&lt;")
               .replace(/>/g, "&gt;");
  }

  disconnectedCallback() {
    if (this.isSpeaking) {
      this.synthesizer.close();
      this.isSpeaking = false;
      this.logWithTimestamp("Synthesizer stopped on disconnect");
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

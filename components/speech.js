// speech.js
import * as sdk from "microsoft-cognitiveservices-speech-sdk";
import { TreeBase } from "./treebase";
import { html } from "uhtml";
import Globals from "app/globals";
import * as Props from "./props";

/**
 * Speech component using Microsoft Cognitive Services Speech SDK.
 * Synthesizes speech via Azure and plays the audio using the Web Audio API.
 * Volume is controlled via a GainNode.
 */
class Speech extends TreeBase {
  // App properties with default values
  stateName = new Props.String("$Speak");
  voiceURI = new Props.String("$VoiceURI", "en-US-DavisNeural"); // Default voice
  expressStyle = new Props.String("$ExpressStyle", "friendly");   // Default expression style
  volume = new Props.Float("$Volume", 1);                          // App volume input (0.0 to 1.0)

  isSpeaking = false; // Track synthesis status
  startTime = null;   // For latency logging

  constructor() {
    super();
    // Create and persist an AudioContext instance
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    this.initSynthesizer();
  }

  /**
   * Logs messages with a timestamp.
   * @param {string} message - Message to log.
   */
  logWithTimestamp(message) {
    console.log(`[${new Date().toISOString()}] ${message}`);
  }

  /**
   * Initializes the Azure Speech synthesizer.
   * No audio config is provided so that playback is handled manually.
   */
  initSynthesizer() {
    this.speechConfig = sdk.SpeechConfig.fromSubscription(
      'c7d8e36fdf414cbaae05819919fd416d', // Replace with your subscription key
      'eastus' // Replace with your service region
    );
    this.speechConfig.speechSynthesisOutputFormat =
      sdk.SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3;
    // Create the synthesizer without an audio config for manual playback
    this.synthesizer = new sdk.SpeechSynthesizer(this.speechConfig);
    this.synthesizer.synthesisStarted = (s, e) => {
      this.startTime = performance.now();
      this.logWithTimestamp("Synthesis started");
    };
    this.synthesizer.synthesisCompleted = (s, e) => {
      const latency = performance.now() - this.startTime;
      this.logWithTimestamp(`Synthesis completed in ${latency.toFixed(2)} ms`);
      this.isSpeaking = false;
      // Reinitialize to ensure a fresh synthesizer for the next call
      this.initSynthesizer();
    };
    this.synthesizer.synthesisCanceled = (s, e) => {
      this.logWithTimestamp(`Synthesis canceled: ${e.reason}`);
      this.isSpeaking = false;
      this.initSynthesizer();
    };
  }

  /**
   * Initiates speech synthesis and plays the audio using the Web Audio API.
   * The audio is decoded into a buffer, then played via a GainNode with the desired volume.
   */
  async speak() {
    if (this.isSpeaking) {
      this.logWithTimestamp("Cancelling current speech synthesis.");
      this.synthesizer.close();
      this.isSpeaking = false;
    }
    this.isSpeaking = true;
    const { state } = Globals;
    const message = state.get(this.stateName.value);
    const voice = state.get(this.voiceURI.value) || "en-US-DavisNeural";
    const style = state.get(this.expressStyle.value) || "friendly";
    const volValue = state.get(this.volume.value);
    if (!message) {
      this.logWithTimestamp("No message to speak.");
      this.isSpeaking = false;
      return;
    }
    this.logWithTimestamp(
      `Using voice: ${voice}, style: ${style}, volume: ${volValue}, message: ${message}`
    );
    // Build SSML (without volume settings in SSML)
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
            // Ensure we have an ArrayBuffer from the audio data (result.audioData may be a Uint8Array)
            const arrayBuffer = result.audioData instanceof ArrayBuffer
              ? result.audioData
              : result.audioData.buffer;
            // Resume the audio context if needed (e.g., on iOS)
            if (this.audioContext.state === 'suspended') {
              this.audioContext.resume();
            }
            // Decode the audio data and play it using a GainNode for volume control
            this.audioContext.decodeAudioData(arrayBuffer)
              .then(decodedData => {
                const source = this.audioContext.createBufferSource();
                source.buffer = decodedData;
                const gainNode = this.audioContext.createGain();
                gainNode.gain.value = volValue; // Apply the volume value
                source.connect(gainNode);
                gainNode.connect(this.audioContext.destination);
                source.start(0);
              })
              .catch(error => {
                this.logWithTimestamp(`Error decoding audio data: ${error}`);
              });
            this.logWithTimestamp(`Speech synthesized successfully in ${latency.toFixed(2)} ms`);
          } else if (result.reason === sdk.ResultReason.Canceled) {
            const cancellationDetails = sdk.SpeechSynthesisCancellationDetails.fromResult(result);
            this.logWithTimestamp(`Speech synthesis canceled: ${cancellationDetails.reason}, ${cancellationDetails.errorDetails}`);
          }
          this.isSpeaking = false;
          this.initSynthesizer();
        },
        (error) => {
          this.logWithTimestamp(`An error occurred: ${error}`);
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
   * Escapes special characters for safe inclusion in SSML.
   * @param {string} text - Text to escape.
   * @returns {string} Escaped text.
   */
  escapeSSML(text) {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  disconnectedCallback() {
    if (this.isSpeaking) {
      this.synthesizer.close();
      this.isSpeaking = false;
      this.logWithTimestamp("Synthesizer stopped on component disconnect");
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



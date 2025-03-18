// speech.js
import * as sdk from "microsoft-cognitiveservices-speech-sdk";
import { TreeBase } from "./treebase";
import { html } from "uhtml";
import Globals from "app/globals";
import * as Props from "./props";

/**
 * Speech component using Microsoft Cognitive Services Speech SDK.
 * Synthesizes speech via Azure and plays the audio using an HTML Audio element.
 * The app's volume input controls playback volume.
 */
class Speech extends TreeBase {
  // Define properties with default values
  stateName = new Props.String("$Speak");
  voiceURI = new Props.String("$VoiceURI", "en-US-DavisNeural"); // Default voice
  expressStyle = new Props.String("$ExpressStyle", "friendly");   // Default expression style
  volume = new Props.Float("$Volume", 1);                          // App volume input (0.0 to 1.0)

  isSpeaking = false; // Track if currently speaking
  startTime = null;   // Track synthesis start time

  constructor() {
    super();
    this.initSynthesizer();
  }

  /**
   * Logs messages with a timestamp for debugging.
   * @param {string} message - The message to log.
   */
  logWithTimestamp(message) {
    console.log(`[${new Date().toISOString()}] ${message}`);
  }

  /**
   * Initializes the Speech Synthesizer.
   * No audio config is provided here to prevent auto-play; we'll handle playback manually.
   */
  initSynthesizer() {
    this.speechConfig = sdk.SpeechConfig.fromSubscription(
      'c7d8e36fdf414cbaae05819919fd416d', // Replace with your actual subscription key
      'eastus' // Replace with your service region
    );

    this.speechConfig.speechSynthesisOutputFormat =
      sdk.SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3;

    // Create the synthesizer without an audio config (manual playback)
    this.synthesizer = new sdk.SpeechSynthesizer(this.speechConfig);

    this.synthesizer.synthesisStarted = (s, e) => {
      this.startTime = performance.now();
      this.logWithTimestamp("Synthesis started");
    };

    this.synthesizer.synthesisCompleted = (s, e) => {
      const endTime = performance.now();
      const latency = endTime - this.startTime;
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
   * Initiates speech synthesis for the given message.
   * The synthesized audio is played via an HTML Audio element,
   * and its volume is set based on the app's volume property.
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
    const volValue = state.get(this.volume.value) || 1;

    if (!message) {
      this.logWithTimestamp("No message to speak.");
      this.isSpeaking = false;
      return;
    }

    this.logWithTimestamp(
      `Using voice: ${voice}, style: ${style}, volume: ${volValue}, message: ${message}`
    );

    // Build the SSML without a volume element (volume is handled at playback)
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
          const endTime = performance.now();
          const latency = endTime - this.startTime;
          if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
            // Create an audio blob from the synthesized audio data
            const audioBlob = new Blob([result.audioData], { type: 'audio/mp3' });
            const url = URL.createObjectURL(audioBlob);
            const audio = new Audio(url);
            // Set the playback volume based on the app's volume input
            audio.volume = volValue;
            audio.play().then(() => {
              // Optionally revoke the object URL after playback begins
              setTimeout(() => URL.revokeObjectURL(url), 5000);
            });
            this.logWithTimestamp(`Speech synthesized successfully in ${latency.toFixed(2)} ms`);
          } else if (result.reason === sdk.ResultReason.Canceled) {
            const cancellationDetails = sdk.SpeechSynthesisCancellationDetails.fromResult(result);
            this.logWithTimestamp(
              `Speech synthesis canceled: ${cancellationDetails.reason}, ${cancellationDetails.errorDetails}`
            );
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
   * Escapes special characters for safe SSML inclusion.
   * @param {string} text - The text to escape.
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


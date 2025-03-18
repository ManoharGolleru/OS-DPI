// speech.js
import * as sdk from "microsoft-cognitiveservices-speech-sdk";
import { TreeBase } from "./treebase";
import { html } from "uhtml";
import Globals from "app/globals";
import * as Props from "./props";

/**
 * Speech component using Microsoft Cognitive Services Speech SDK.
 * Synthesizes speech via Azure and plays the audio using an HTMLAudioElement
 * connected to the Web Audio API for gain control.
 */
class Speech extends TreeBase {
  // App properties with default values
  stateName = new Props.String("$Speak");
  voiceURI = new Props.String("$VoiceURI", "en-US-DavisNeural"); // Default voice
  expressStyle = new Props.String("$ExpressStyle", "friendly");   // Default style
  volume = new Props.Float("$Volume", 1);                          // App volume input (0.0 to 1.0)

  isSpeaking = false; // Track if synthesis is ongoing
  startTime = null;   // For latency logging

  constructor() {
    super();
    // Create and persist an AudioContext instance
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    this.initSynthesizer();
  }

  /**
   * Logs messages with a timestamp.
   * @param {string} message - The message to log.
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
      // Reinitialize for the next call
      this.initSynthesizer();
    };
    this.synthesizer.synthesisCanceled = (s, e) => {
      this.logWithTimestamp(`Synthesis canceled: ${e.reason}`);
      this.isSpeaking = false;
      this.initSynthesizer();
    };
  }

  /**
   * Initiates speech synthesis and plays audio using an HTMLAudioElement connected
   * to a GainNode so that the app's volume input affects output loudness.
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
    
    // Log the volume value for debugging.
    this.logWithTimestamp(`Volume value from state: ${volValue}`);
    
    if (!message) {
      this.logWithTimestamp("No message to speak.");
      this.isSpeaking = false;
      return;
    }
    
    this.logWithTimestamp(
      `Using voice: ${voice}, style: ${style}, volume: ${volValue}, message: ${message}`
    );
    
    // Build the SSML (without volume settings; volume will be controlled on playback)
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
            // Create an audio blob from the synthesized audio data.
            const audioBlob = new Blob([result.audioData], { type: 'audio/mp3' });
            const url = URL.createObjectURL(audioBlob);
            const audio = new Audio(url);
            // Ensure the AudioContext is resumed (necessary in some browsers)
            if (this.audioContext.state === 'suspended') {
              this.audioContext.resume();
            }
            // Use the MediaElementAudioSourceNode approach.
            const mediaSource = this.audioContext.createMediaElementSource(audio);
            const gainNode = this.audioContext.createGain();
            gainNode.gain.value = volValue; // Set the gain to the volume input
            // Connect the nodes: media source -> gain -> destination
            mediaSource.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            // Play the audio element.
            audio.play().then(() => {
              // Optionally revoke the object URL after a short delay.
              setTimeout(() => URL.revokeObjectURL(url), 5000);
            }).catch(err => {
              this.logWithTimestamp(`Audio play error: ${err}`);
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



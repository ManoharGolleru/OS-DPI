// speech.js
import * as sdk from "microsoft-cognitiveservices-speech-sdk";
import { TreeBase } from "./treebase";
import { html } from "uhtml";
import Globals from "app/globals";
import * as Props from "./props";

/**
 * Speech component using Microsoft Cognitive Services Speech SDK.
 */
class Speech extends TreeBase {
  // Define properties with default values
  stateName = new Props.String("$Speak");
  voiceURI = new Props.String("$VoiceURI", "en-US-DavisNeural"); // Default to DavisNeural
  expressStyle = new Props.String("$ExpressStyle", "friendly"); // Default expression style
  isSpeaking = false; // Track if currently speaking
  startTime = null; // Track synthesis start time

  constructor() {
    super();
    this.initSynthesizer();
  }

  /**
   * Logs messages with a timestamp for debugging purposes.
   * @param {string} message - The message to log.
   */
  logWithTimestamp(message) {
    console.log(`[${new Date().toISOString()}] ${message}`);
  }

  /**
   * Initializes the Speech Synthesizer with the Microsoft SDK.
   */
  initSynthesizer() {
    this.speechConfig = sdk.SpeechConfig.fromSubscription(
      '', // Replace with your actual subscription key
      'eastus' // Replace with your service region
    );

    this.speechConfig.speechSynthesisOutputFormat =
      sdk.SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3;

    this.audioConfig = sdk.AudioConfig.fromDefaultSpeakerOutput();
    this.synthesizer = new sdk.SpeechSynthesizer(
      this.speechConfig,
      this.audioConfig
    );

    this.synthesizer.synthesisStarted = (s, e) => {
      this.startTime = performance.now();
      this.logWithTimestamp("Synthesis started");
    };

    this.synthesizer.synthesisCompleted = (s, e) => {
      const endTime = performance.now();
      const latency = endTime - this.startTime;
      this.logWithTimestamp(`Synthesis completed in ${latency.toFixed(2)} ms`);
      this.isSpeaking = false;
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

    if (!message) {
      this.logWithTimestamp("No message to speak.");
      this.isSpeaking = false;
      return;
    }

    this.logWithTimestamp(`Using voice: ${voice}, style: ${style}, message: ${message}`);

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

// gemini-ai-agent/index.js
// import { EventEmitter } from 'events';
import EventEmitter from 'eventemitter3';

/**
 * GeminiAIAgent - A reusable AI agent package for multimodal interactions
 */
export class GeminiAIAgent extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.apiKey = options.apiKey;
    this.host = options.host || 'generativelanguage.googleapis.com';
    this.model = options.model || 'models/gemini-2.0-flash-exp';
    this.voiceName = options.voiceName || 'Puck';
    this.systemInstructions = options.systemInstructions || '';
    this.tools = options.tools || [];
    
    // Internal state
    this.ws = null;
    this.audioContext = null;
    this.audioStreamer = null;
    this.audioRecorder = null;
    this.mediaHandler = null;
    this.isRecording = false;
    this.isConnected = false;
    this.isMuted = false;
    this.isVideoActive = false;
    
    // Setup endpoint
    this.endpoint = `wss://${this.host}/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${this.apiKey}`;
  }

  /**
   * Initialize the agent
   */
  async initialize() {
    try {
      await this._initializeAudio();
      await this._initializeWebSocket();
      this.emit('initialized');
      return true;
    } catch (error) {
      this.emit('error', error);
      return false;
    }
  }

  /**
   * Start voice recording
   */
  async startRecording() {
    if (this.isRecording) return false;
    
    try {
      if (!this.isConnected) {
        await this._reconnect();
      }

      // Initialize audio recorder
      if (!this.audioRecorder) {
        const { AudioRecorder } = await import('./shared/audio-recorder.js');
        this.audioRecorder = new AudioRecorder();
      }

      await this.audioRecorder.start();
      
      this.audioRecorder.on('data', (base64Data) => {
        this._sendAudioChunk(base64Data);
      });

      this.isRecording = true;
      this.emit('recordingStarted');
      return true;
    } catch (error) {
      this.emit('error', error);
      return false;
    }
  }

  /**
   * Stop voice recording
   */
  stopRecording() {
    if (!this.isRecording) return false;

    try {
      if (this.audioRecorder) {
        this.audioRecorder.stop();
        this.audioRecorder.removeAllListeners('data');
      }

      this.isRecording = false;
      this.isMuted = false;
      this._sendEndMessage();
      this.emit('recordingStopped');
      return true;
    } catch (error) {
      this.emit('error', error);
      return false;
    }
  }

  /**
   * Toggle mute state
   */
  toggleMute() {
    if (!this.audioRecorder || !this.isRecording) return false;

    this.isMuted = !this.isMuted;
    
    if (this.isMuted) {
      this.audioRecorder.mute();
    } else {
      this.audioRecorder.unmute();
    }

    this.emit('muteToggled', this.isMuted);
    return this.isMuted;
  }

  /**
   * Start video capture (webcam)
   */
  async startVideo() {
    if (this.isVideoActive) return false;

    try {
      if (!this.mediaHandler) {
        const { MediaHandler } = await import('./shared/media-handler.js');
        this.mediaHandler = new MediaHandler();
      }

      const success = await this.mediaHandler.startWebcam();
      if (success) {
        this.isVideoActive = true;
        this._startFrameCapture();
        this.emit('videoStarted');
      }
      return success;
    } catch (error) {
      this.emit('error', error);
      return false;
    }
  }

  /**
   * Stop video capture
   */
  stopVideo() {
    if (!this.isVideoActive || !this.mediaHandler) return false;

    try {
      this.mediaHandler.stopAll();
      this.isVideoActive = false;
      this.emit('videoStopped');
      return true;
    } catch (error) {
      this.emit('error', error);
      return false;
    }
  }

  /**
   * Send text message
   */
  sendTextMessage(text) {
    if (!this.isConnected) return false;

    try {
      const message = {
        realtimeInput: {
          mediaChunks: [{
            mimeType: "text/plain",
            data: btoa(text)
          }]
        }
      };
      this.ws.send(JSON.stringify(message));
      this.emit('messageSent', text);
      return true;
    } catch (error) {
      this.emit('error', error);
      return false;
    }
  }

  /**
   * Add custom tool
   */
  addTool(toolDefinition, handler) {
    this.tools.push({
      definition: toolDefinition,
      handler: handler
    });
  }

  /**
   * Get current state
   */
  getState() {
    return {
      isRecording: this.isRecording,
      isConnected: this.isConnected,
      isMuted: this.isMuted,
      isVideoActive: this.isVideoActive
    };
  }

  /**
   * Disconnect and cleanup
   */
  disconnect() {
    try {
      if (this.isRecording) {
        this.stopRecording();
      }
      
      if (this.isVideoActive) {
        this.stopVideo();
      }

      if (this.ws) {
        this.ws.close();
      }

      if (this.audioContext && this.audioContext.state === "closed") {
        this.audioContext.close();
      }

      this.isConnected = false;
      this.emit('disconnected');
    } catch (error) {
      this.emit('error', error);
    }
  }

  // Private methods
  async _initializeAudio() {
    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)({ 
        sampleRate: 24000 
      });
      console.log("_initializeAudio",this.audioContext);
       console.log(" before resume");
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }
 console.log("after resume");
      const { AudioStreamer } = await import('./shared/audio-streamer.js');
      this.audioStreamer = new AudioStreamer(this.audioContext);
      console.log(this);
      
    } catch (error) {
      throw new Error(`Audio initialization failed: ${error.message}`);
    }
  }

  async _initializeWebSocket() {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.endpoint);
        
        this.ws.onopen = () => {
          this._sendSetupMessage();
        };

        this.ws.onmessage = async (event) => {
        let wsResponse;
        if (event.data instanceof Blob) {
          const responseText = await event.data.text();
          wsResponse = JSON.parse(responseText);
        } else {
          wsResponse = JSON.parse(event.data);
        }

        // console.log('WebSocket Response:', wsResponse);
          await this._handleMessage(wsResponse);
        };

        this.ws.onclose = (event) => {
          this.isConnected = false;
          this.emit('disconnected', event);
        };

        this.ws.onerror = (error) => {
          reject(error);
        };

        // Setup complete handler
        this._onSetupComplete = () => {
          this.isConnected = true;
          resolve();
        };

      } catch (error) {
        reject(error);
      }
    });
  }

  _sendSetupMessage() {
    const setupMessage = {
      setup: {
        model: this.model,
        system_instruction: {
          role: "user",
          parts: [{
            text: this.systemInstructions
          }]
        },
        tools: this._buildToolsConfig(),
        generation_config: {
          response_modalities: ["audio"],
          speech_config: {
            voice_config: {
              prebuilt_voice_config: {
                voice_name: this.voiceName
              }
            }
          }
        }
      }
    };

    this.ws.send(JSON.stringify(setupMessage));
  }

  _buildToolsConfig() {
    const toolsConfig = [];
    
    // Add custom tools
    if (this.tools.length > 0) {
      const functionDeclarations = this.tools.map(tool => tool.definition);
      toolsConfig.push({ functionDeclarations });
    }

    // Add built-in tools
    toolsConfig.push({ codeExecution: {} });
    toolsConfig.push({ googleSearch: {} });

    return toolsConfig;
  }

  async _handleMessage(message) {
    if (message.setupComplete) {
      this._onSetupComplete?.();
    }

    if (message.serverContent?.modelTurn?.parts) {
        
      for (const part of message.serverContent.modelTurn.parts) {
        if (part.inlineData?.mimeType.includes('audio/pcm')) {
          await this._playAudioChunk(part.inlineData.data);
        }
        
        if (part.functionCall) {
          await this._handleToolCall(part.functionCall);
        }
      }
    }

    if (message.serverContent?.interrupted) {
      this.emit('interrupted');
      this.audioStreamer?.stop();
    }

    if (message.serverContent?.turnComplete) {
      this.emit('turnComplete');
      this.audioStreamer?.complete();
    }
  }

  async _handleToolCall(functionCall) {
    this.emit('toolCall', functionCall);
    
    // Find and execute the tool handler
    const tool = this.tools.find(t => t.definition.name === functionCall.name);
    if (tool && tool.handler) {
      try {
        const result = await tool.handler(functionCall.args);
        this._sendToolResponse([{
          id: functionCall.id,
          name: functionCall.name,
          response: {
            result: {
              object_value: result
            }
          }
        }]);
      } catch (error) {
        this.emit('error', error);
      }
    }
  }

  _sendAudioChunk(base64Data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const message = {
        realtimeInput: {
          mediaChunks: [{
            mimeType: "audio/pcm",
            data: base64Data
          }]
        }
      };
      this.ws.send(JSON.stringify(message));
    }
  }

  _sendEndMessage() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const message = {
        clientContent: {
          turns: [{
            role: "user",
            parts: [{
              text: ""
            }]
          }],
          turnComplete: true
        }
      };
      this.ws.send(JSON.stringify(message));
    }
  }

  _sendToolResponse(responses) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const message = {
        clientContent: {
          turns: [{
            role: "user",
            parts: responses.map(response => ({
              functionResponse: response
            }))
          }],
          turnComplete: true
        }
      };
      this.ws.send(JSON.stringify(message));
    }
  }

  async _playAudioChunk(base64AudioChunk) {
    try {
        
      const arrayBuffer = this._base64ToArrayBuffer(base64AudioChunk);
      const uint8Array = new Uint8Array(arrayBuffer);
      this.audioStreamer.addPCM16(uint8Array);
      this.audioStreamer.resume();
      this.emit('audioPlaying');
    } catch (error) {
        console.log(error);
        
      this.emit('error', error);
    }
  }

  _startFrameCapture() {
    if (this.mediaHandler) {
      this.mediaHandler.startFrameCapture((base64Image) => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          const message = {
            realtimeInput: {
              mediaChunks: [{
                mimeType: "image/jpeg",
                data: base64Image
              }]
            }
          };
          this.ws.send(JSON.stringify(message));
        }
      });
    }
  }

  async _reconnect() {
    if (this.ws) {
      this.ws.close();
    }
    await this._initializeWebSocket();
  }

  _base64ToArrayBuffer(base64) {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }
}

// Export helper functions and classes
export { AudioRecorder } from './shared/audio-recorder.js';
export { AudioStreamer } from './shared/audio-streamer.js';
export { MediaHandler } from './shared/media-handler.js';

// Default export
export default GeminiAIAgent;
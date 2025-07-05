// gemini-ai-agent/react/useGeminiAgent.js
import { useState, useEffect, useRef, useCallback } from 'react';
import { GeminiAIAgent } from '../index.js';

/**
 * React hook for using Gemini AI Agent
 * @param {Object} config - Configuration object
 * @returns {Object} - Agent state and methods
 */
export function useGeminiAgent(config) {
  const agentRef = useRef(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoActive, setIsVideoActive] = useState(false);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
   const [isAudioReady, setIsAudioReady] = useState(false);
   const initMessageFlag = useRef(false)

  // Initialize agent
  useEffect(() => {
    if (!config.apiKey) {
      setError(new Error('API key is required'));
      return;
    }

    const initializeAgent = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        agentRef.current = new GeminiAIAgent(config);
        
        // Setup event listeners
        agentRef.current.on('initialized', () => {
          setIsInitialized(true);
          setIsConnected(true);
          setIsLoading(false);
        });

        agentRef.current.on('recordingStarted', () => {
          setIsRecording(true);
                if(config.sendInitAudioChunk && !initMessageFlag.current){
                  agentRef.current._sendAudioChunk(config.sendInitAudioChunk)
                  initMessageFlag.current = true
                }
                else if(config.sendInitText && !initMessageFlag.current){
                  agentRef.current.sendTextMessage(config.sendInitText)
                  initMessageFlag.current = true
                }
        });

        agentRef.current.on('recordingStopped', () => {
          setIsRecording(false);
          setIsMuted(false);
        });

        agentRef.current.on('muteToggled', (muted) => {
          setIsMuted(muted);
        });

        agentRef.current.on('audioPlaying', () => {
          setIsAudioReady(true);
        });

        agentRef.current.on('videoStarted', () => {
          setIsVideoActive(true);
        });

        agentRef.current.on('videoStopped', () => {
          setIsVideoActive(false);
        });

        agentRef.current.on('disconnected', () => {
          setIsConnected(false);
        });

        agentRef.current.on('error', (err) => {
          setError(err);
          setIsLoading(false);
          console.log(err,"useHook");
          
        });

        // Initialize the agent
        await agentRef.current.initialize();
        
      } catch (err) {
        setError(err);
        setIsLoading(false);
      }
    };

    initializeAgent();

    // Cleanup on unmount
    return () => {
      if (agentRef.current) {
        agentRef.current.disconnect();
        agentRef.current.removeAllListeners();
      }
    };
  }, [config.apiKey, config.systemInstructions]);

  // Methods
  const startRecording = useCallback(async () => {
    if (!agentRef.current) return false;
    return await agentRef.current.startRecording();
  }, []);

  const stopRecording = useCallback(() => {
    if (!agentRef.current) return false;
    return agentRef.current.stopRecording();
  }, []);

  const toggleRecording = useCallback(async () => {
    if (isRecording) {
      return stopRecording();
    } else {
      return await startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  const toggleMute = useCallback(() => {
    if (!agentRef.current) return false;
    return agentRef.current.toggleMute();
  }, []);

  const startVideo = useCallback(async () => {
    if (!agentRef.current) return false;
    return await agentRef.current.startVideo();
  }, []);

  const stopVideo = useCallback(() => {
    if (!agentRef.current) return false;
    return agentRef.current.stopVideo();
  }, []);

  const toggleVideo = useCallback(async () => {
    if (isVideoActive) {
      return stopVideo();
    } else {
      return await startVideo();
    }
  }, [isVideoActive, startVideo, stopVideo]);

  const sendMessage = useCallback((text) => {
    if (!agentRef.current) return false;
    return agentRef.current.sendTextMessage(text);
  }, []);

  const addTool = useCallback((toolDefinition, handler) => {
    if (!agentRef.current) return;
    agentRef.current.addTool(toolDefinition, handler);
  }, []);

  const disconnect = useCallback(() => {
    if (!agentRef.current) return;
    agentRef.current.disconnect();
  }, []);

  // Event listener helpers
  const addEventListener = useCallback((event, callback) => {
    if (!agentRef.current) return;
    agentRef.current.on(event, callback);
    
    // Return cleanup function
    return () => {
      if (agentRef.current) {
        agentRef.current.off(event, callback);
      }
    };
  }, []);

  return {
    // State
    isInitialized,
    isRecording,
    isConnected,
    isMuted,
    isVideoActive,
    error,
    isLoading,
    
    // Methods
    startRecording,
    stopRecording,
    toggleRecording,
    toggleMute,
    startVideo,
    stopVideo,
    toggleVideo,
    sendMessage,
    addTool,
    disconnect,
    addEventListener,
    
    // Direct agent access (for advanced usage)
    agent: agentRef.current
  };
}
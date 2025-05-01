// App.tsx
import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  TouchableOpacity, 
  Alert,
  ActivityIndicator,
  ScrollView
} from 'react-native';
import * as FileSystem from 'expo-file-system';
import RenderHtml, { defaultSystemFonts } from 'react-native-render-html';
import { Audio } from 'expo-av';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Dashboard } from './components/Dashboard';
import { AnalysisResult, RecordingHistory } from './types';
import { transcribeAudio } from './services/transcribeService';
import { analyzeTranscript } from './services/analysisService';
import { GestureHandlerRootView } from 'react-native-gesture-handler';


export default function App(): React.ReactElement {
  // State variables with proper types
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordingUri, setRecordingUri] = useState<string | null>(null);
  const [recordingDuration, setRecordingDuration] = useState<number>(0);
  const [timerInterval, setTimerInterval] = useState<NodeJS.Timeout | null>(null);
  const [transcriptionText, setTranscriptionText] = useState<string>('');
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isStoppingRecording, setIsStoppingRecording] = useState(false);

  const [permissionResponse, requestPermission] = Audio.usePermissions();
  // Add new state variables
  const [recordings, setRecordings] = useState<RecordingHistory[]>([]);
  const [showRecording, setShowRecording] = useState<boolean>(false);
  const [selectedRecording, setSelectedRecording] = 
    useState<RecordingHistory | null>(null);
  
  const renderHtmlConfig = {
    systemFonts: [...defaultSystemFonts],
    tagsStyles: {
      body: {
        color: '#333',
        fontSize: 14,
        lineHeight: 20,
        fontFamily: 'System', // Use system font
      },
      p: {
        marginBottom: 10,
      },
      ul: {
        marginLeft: 20,
      },
      li: {
        marginBottom: 5,
      }
    },
    enableExperimentalBRCollapsing: true,
    enableExperimentalGhostLinesPrevention: true,
  };

  // Check and request permissions on component mount
  useEffect(() => {
    if (permissionResponse && !permissionResponse.granted) {
      requestPermission();
    }
  }, [permissionResponse]);

  // Clean up resources when component unmounts
  useEffect(() => {
    return () => {
      if (recording) {
        stopRecording();
      }
      if (timerInterval) {
        clearInterval(timerInterval);
      }
    };
  }, [recording, timerInterval]);


  const resetRecordingState = () => {
    // Reset recording-related states
    setRecording(null);
    setIsRecording(false);
    setRecordingUri(null);
    setRecordingDuration(0);
    if (timerInterval) {
      clearInterval(timerInterval);
      setTimerInterval(null);
    }
    
    // Reset analysis-related states
    setTranscriptionText('');
    setAnalysisResult(null);
    setIsLoading(false);
  };

  // Format seconds into mm:ss format
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
    const secs = (seconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  };

  // Load recordings from storage on mount
  useEffect(() => {
    loadRecordings();
  }, []);

  const loadRecordings = async () => {
    try {
      const stored = await AsyncStorage.getItem('recordings');
      if (stored) {
        setRecordings(JSON.parse(stored));
      }
    } catch (error) {
      console.error('Error loading recordings:', error);
    }
  };

  const saveRecording = async (newRecording: RecordingHistory) => {
    try {
      const updatedRecordings = [newRecording, ...recordings];
      await AsyncStorage.setItem(
        'recordings', 
        JSON.stringify(updatedRecordings)
      );
      setRecordings(updatedRecordings);
    } catch (error) {
      console.error('Error saving recording:', error);
    }
  };


  // Start recording function
  const startRecording = async (): Promise<void> => {
    try {
      // Prevent starting if already processing
      if (isLoading || isStoppingRecording) {
        return;
      }

      // First ensure we're not already recording
      if (isRecording || recording) {
        console.log('Already recording, resetting state first');
        // Just reset state instead of calling stopRecording() to avoid potential recursion
        if (timerInterval) clearInterval(timerInterval);
        setTimerInterval(null);
        setIsRecording(false);
        setRecording(null);
        // Add a small delay to ensure cleanup
        await new Promise(resolve => setTimeout(resolve, 300));
      }

      // Check permissions first
      if (!permissionResponse || !permissionResponse.granted) {
        const { granted } = await requestPermission();
        if (!granted) {
          Alert.alert('Permission Required', 'Audio recording permission is needed for this app to function');
          return;
        }
      }

      // Configure audio session with basic settings
      console.log("Setting audio mode...");
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
        staysActiveInBackground: true  // Keep recording if app goes to background
      });

      console.log('Creating new recording...');
      // Use the standard preset options
      const { recording: newRecording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      
      console.log('Recording created successfully');
      setRecording(newRecording);
      setIsRecording(true);
      setRecordingDuration(0);
      
      // Start timer
      const interval = setInterval(() => {
        setRecordingDuration(prev => {
          // Auto-stop at 60 seconds
          if (prev >= 60) {
            console.log('Maximum recording time reached, stopping...');
            stopRecording();
            return prev;
          }
          return prev + 1;
        });
      }, 1000);
      
      setTimerInterval(interval);
      
    } catch (error) {
      console.error('Failed to start recording', error);
      Alert.alert('Error', 'Failed to start recording');
      // Clean up any partial state
      setIsRecording(false);
      setRecording(null);
      if (timerInterval) {
        clearInterval(timerInterval);
        setTimerInterval(null);
      }
    }
  };

  // Stop recording function
  const stopRecording = async (): Promise<void> => {


    if (isStoppingRecording || isLoading) {
      console.log('Stop recording or processing already in progress');
      return;
    }
        // Early return if no active recording
    if (!recording) return;

    try {
      setIsStoppingRecording(true);
      
      // Store local reference
      const currentRecording = recording;
      
      // Clear states first
      setIsRecording(false);
      setRecording(null);
      if (timerInterval) {
        clearInterval(timerInterval);
        setTimerInterval(null);
      }
      
      console.log("Attempting to stop recording...");
      await currentRecording.stopAndUnloadAsync();
      console.log("Successfully stopped recording");
      
      const uri = currentRecording.getURI();
      if (uri) {
        console.log("Successfully got URI" + uri);
        setRecordingUri(uri);
        console.log("Getting recording duration..." + recordingDuration);
        
        if (recordingDuration >= 15) {
          processRecording(uri);
          console.log("Processing recording completed.");
        } else {
          Alert.alert('Recording Too Short', 
            'Recording should be at least 15 seconds long. Please try again.'
          );
        }
      }
    } catch (error) {
      console.warn('Could not stop recording properly:', error);
      // Error recovery attempt
      if (recording) {
        try {
          const uri = recording.getURI();
          if (uri && recordingDuration >= 15) {
            setRecordingUri(uri);
            processRecording(uri);
            return;
          }
        } catch (uriError) {
          console.warn("Could not get URI after failed stop:", uriError);
        }
      }
    } finally {
      setIsStoppingRecording(false);
    }
  };

    // Modify processRecording to save the recording
    const processRecording = async (uri: string): Promise<void> => {
      setIsLoading(true);
      
      try {
        const transcription = await transcribeAudio(uri);
        setTranscriptionText(transcription);
        
        // const analysis = await analyzeTranscript(transcription);
        const analysis = await analyzeTranscript(transcription);
        setAnalysisResult(analysis);
  
        // Save the recording
        const newRecording: RecordingHistory = {
          id: Date.now().toString(),
          date: new Date().toISOString(),
          duration: recordingDuration,
          uri,
          transcription,
          analysis,
        };
  
        await saveRecording(newRecording);
      } catch (error) {
        console.error('Error processing recording:', error);
        Alert.alert(
          'Processing Error', 
          'Failed to process your recording. Please try again.'
        );
      } finally {
        setIsLoading(false);
      }
    };

    // Navigation handlers
    const handleNewRecording = () => {
      resetRecordingState();
      setShowRecording(true);
      setSelectedRecording(null);
    };
  
    const handleViewRecording = (recording: RecordingHistory) => {
      setSelectedRecording(recording);
      setShowRecording(true);
    };
  
    const handleBack = () => {
      setShowRecording(false);
      setSelectedRecording(null);
    };
    const handleDeleteRecording = async (recordingId: string) => {
      try {
        // Get the recording to delete
        const recordingToDelete = recordings.find(r => r.id === recordingId);
        if (!recordingToDelete) return;
    
        // Delete the audio file
        if (recordingToDelete.uri) {
          await FileSystem.deleteAsync(recordingToDelete.uri, { idempotent: true });
        }
    
        // Update recordings state
        const updatedRecordings = recordings.filter(r => r.id !== recordingId);
        setRecordings(updatedRecordings);
    
        // Update AsyncStorage
        await AsyncStorage.setItem(
          'recordings', 
          JSON.stringify(updatedRecordings)
        );
    
      } catch (error) {
        console.error('Error deleting recording:', error);
        Alert.alert(
          'Error',
          'Failed to delete recording. Please try again.'
        );
      }
    };
    

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <View style={styles.container}>
      <StatusBar style="auto" />
      
      <View style={styles.header}>
        <Text style={styles.title}>Phonolyx</Text>
      </View>
      
      {showRecording ? (
        <>
          <View style={styles.header}>
            <TouchableOpacity 
              style={styles.backButton} 
              onPress={handleBack}
            >
              <Text style={styles.backButtonText}>← Back</Text>
            </TouchableOpacity>
            <Text style={styles.title}>
              {selectedRecording ? 'View Recording' : 'New Recording'}
            </Text>
          </View>

          {selectedRecording ? (
            // View recording details
            <ScrollView style={styles.content}>
              <View style={styles.recordingDetails}>
                <Text style={styles.dateText}>
                  {new Date(selectedRecording.date).toLocaleString('en-US', {
                    month: 'long',
                    day: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </Text>
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Transcription</Text>
                  <View style={styles.transcriptionBox}>
                    <Text style={styles.transcriptionText}>{selectedRecording.transcription}</Text>
                  </View>
                </View>
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Analysis Results</Text>
                  <View style={styles.scoreContainer}>
                    <Text style={styles.scoreLabel}>Score</Text>
                    <View style={styles.scoreCircle}>
                      <Text style={styles.scoreValue}>{selectedRecording.analysis.mos_score}</Text>
                      <Text style={styles.scoreMax}>/5</Text>
                    </View>
                  </View>
                  <View style={styles.feedbackContainer}>
                    <Text style={styles.feedbackTitle}>Feedback</Text>
                    <Text style={styles.feedbackText}>{selectedRecording.analysis.critical_feedback}</Text>
                  </View>
                </View>
                {/* Display transcription and analysis */}
                {/* ... existing analysis display code ... */}
              </View>
            </ScrollView>
          ): (
      
        <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
          {/* Recording Section */}
          <View style={styles.recordingSection}>
            <Text style={styles.sectionTitle}>
              {isRecording ? 'Recording in Progress' : 'Record Your English Language'}
            </Text>
            
            <View style={styles.timerContainer}>
              <Text style={styles.timer}>
                {formatTime(recordingDuration)}
              </Text>
              {isRecording && recordingDuration < 15 && (
                <Text style={styles.timerHint}>
                  (Minimum 15 seconds required)
                </Text>
              )}
            </View>
            
            <TouchableOpacity
              style={[
                styles.recordButton,
                isRecording ? styles.recordingActive : {},
                (isLoading || isStoppingRecording) && styles.recordButtonDisabled
              ]}
              onPress={isRecording ? stopRecording : startRecording}
            >
              <Text style={styles.recordButtonText}>
                {isRecording ? 'Stop Recording' : 'Start Recording'}
              </Text>
            </TouchableOpacity>
          </View>
          
          {/* Processing Indicator */}
          {isLoading && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#6200ee" />
              <Text style={styles.loadingText}>
                {isStoppingRecording ? 'Stopping recording...' : 'Processing your recording...'}
              </Text>
            </View>
          )}
          
          {/* Transcription Section */}
          {transcriptionText && !isLoading && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Transcription</Text>
              <View style={styles.transcriptionBox}>
                <Text style={styles.transcriptionText}>{transcriptionText}</Text>
              </View>
            </View>
          )}
          
          {/* Analysis Results Section */}
          {analysisResult && !isLoading && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Analysis Results</Text>
              
              <View style={styles.scoreContainer}>
                <Text style={styles.scoreLabel}>Score</Text>
                <View style={styles.scoreCircle}>
                  <Text style={styles.scoreValue}>{analysisResult.mos_score}</Text>
                  <Text style={styles.scoreMax}>/5</Text>
                </View>
              </View>
              
              <View style={styles.feedbackContainer}>
                <Text style={styles.feedbackTitle}>Areas of Strength</Text>
                <Text style={styles.feedbackText}>{analysisResult.positive_feedback}</Text>
              </View>
              
             <View style={styles.feedbackContainer}>
                <Text style={styles.feedbackTitle}>Areas for Improvement</Text>
                <Text style={styles.feedbackText}>{analysisResult.critical_feedback}</Text>
              </View>
              
              <View style={styles.metricsContainer}>
                <Text style={styles.metricsTitle}>Metrics</Text>
                <View style={styles.metricRow}>
                  <Text style={styles.metricLabel}>Word Count:</Text>
                  <Text style={styles.metricValue}>{analysisResult.metrics.wordCount}</Text>
                </View>
                
                <View style={styles.metricRow}>
                  <Text style={styles.metricLabel}>Sentence Count:</Text>
                  <Text style={styles.metricValue}>{analysisResult.metrics.sentenceCount}</Text>
                </View>
                
                <View style={styles.metricRow}>
                  <Text style={styles.metricLabel}>Avg. Words per Sentence:</Text>
                  <Text style={styles.metricValue}>{analysisResult.metrics.avgWordsPerSentence}</Text>
                </View>
              </View>
            </View>
          )}
        </ScrollView>
          )}
        </>
      ) : (
        <Dashboard 
          recordings={recordings} 
          onNewRecording={handleNewRecording} 
          onViewRecording={handleViewRecording} 
          onDeleteRecording={handleDeleteRecording}
        />
      )}
    </View>
    </GestureHandlerRootView>
  );
}

// Styles
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f7',
  },
  header: {
    paddingTop: 50,
    paddingBottom: 15,
    backgroundColor: '#6200ee',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: 'white',
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  recordingSection: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.22,
    shadowRadius: 2.22,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
    color: '#333',
  },
  timerContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  timer: {
    fontSize: 48,
    fontWeight: '300',
    color: '#333',
  },
  timerHint: {
    color: '#666',
    marginTop: 5,
    fontSize: 14,
  },
  recordButton: {
    backgroundColor: '#6200ee',
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 30,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  recordingActive: {
    backgroundColor: '#ff5252',
  },
  recordButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  loadingContainer: {
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  section: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.22,
    shadowRadius: 2.22,
  },
  transcriptionBox: {
    backgroundColor: '#f9f9f9',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  transcriptionText: {
    fontSize: 16,
    lineHeight: 24,
    color: '#333',
  },
  scoreContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  scoreLabel: {
    fontSize: 18,
    fontWeight: '500',
    color: '#666',
    marginBottom: 8,
  },
  scoreCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#6200ee',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  scoreValue: {
    fontSize: 30,
    fontWeight: 'bold',
    color: 'white',
  },
  scoreMax: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.7)',
    alignSelf: 'flex-end',
    marginBottom: 6,
  },
  feedbackContainer: {
    marginBottom: 20,
  },
  feedbackTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    color: '#333',
  },
  feedbackText: {
    fontSize: 16,
    lineHeight: 24,
    color: '#444',
  },
  metricsContainer: {
    backgroundColor: '#f9f9f9',
    padding: 16,
    borderRadius: 8,
  },
  metricsTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    color: '#333',
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  metricLabel: {
    fontSize: 15,
    color: '#666',
  },
  metricValue: {
    fontSize: 15,
    fontWeight: '500',
    color: '#333',
  },
  backButton: {
    padding: 8,
  },
  backButtonText: {
    color: 'white',
    fontSize: 16,
  },
  dateText: {
    fontSize: 16,
    color: '#666',
    marginBottom: 16,
  },
  recordingDetails: {
    padding: 16,
  },
  recordButtonDisabled: {
    backgroundColor: '#cccccc',
    elevation: 0,
    shadowOpacity: 0,
  },
  
  recordButtonTextDisabled: {
    color: '#666666',
  }
});
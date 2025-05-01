import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';


export const transcribeAudio = async (audioUri: string): Promise<string> => {

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
    throw new Error("OpenAI API key not set");
} 

// First, verify the file exists
const fileInfo = await FileSystem.getInfoAsync(audioUri);
if (!fileInfo.exists) {
    throw new Error('Audio file does not exist');
}

// Create the form data
const formData = new FormData();

// Prepare file path
const fileUri = Platform.OS === 'android' ? audioUri : audioUri.replace('file://', '');

// Add file to form data
formData.append('file', {
    uri: fileUri,
    type: 'audio/m4a',
    name: 'recording.m4a'
} as any);

formData.append('model', 'whisper-1');

// Make the API call using fetch instead
const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
    'Authorization': `Bearer ` + OPENAI_API_KEY,
    },
    body: formData,
});

if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`API Error: ${JSON.stringify(errorData)}`);
}

const data = await response.json();
return data.text;

};

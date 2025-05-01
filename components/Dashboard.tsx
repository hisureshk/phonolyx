// components/Dashboard.tsx
import React, { useCallback, useRef } from 'react';
import { 
  View, 
  Text, 
  FlatList, 
  TouchableOpacity, 
  StyleSheet,
  Animated,
  Alert 
} from 'react-native';
import { format } from 'date-fns';
import { Swipeable } from 'react-native-gesture-handler';
import { RecordingHistory } from '../types';

interface DashboardProps {
  recordings: RecordingHistory[];
  onNewRecording: () => void;
  onViewRecording: (recording: RecordingHistory) => void;
  onDeleteRecording: (recordingId: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ 
  recordings, 
  onNewRecording, 
  onViewRecording,
  onDeleteRecording 
}) => {

  // Reference to open swipeable
  const openSwipeableRef = useRef<Swipeable | null>(null);

  const closeCurrentSwipeable = () => {
    if (openSwipeableRef.current) {
      openSwipeableRef.current.close();
      openSwipeableRef.current = null;
    }
  };

  const renderRightActions = (
    progress: Animated.AnimatedInterpolation<number>,
    dragX: Animated.AnimatedInterpolation<number>,
    recordingId: string
  ) => {
    const trans = dragX.interpolate({
      inputRange: [-100, 0],
      outputRange: [0, 100],
    });

    const confirmDelete = () => {
      Alert.alert(
        'Delete Recording',
        'Are you sure you want to delete this recording?',
        [
          {
            text: 'Cancel',
            style: 'cancel',
            onPress: closeCurrentSwipeable
          },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => {
              onDeleteRecording(recordingId);
              closeCurrentSwipeable();
            }
          }
        ]
      );
    };

    return (
      <Animated.View 
        style={[
          styles.deleteAction,
          {
            transform: [{ translateX: trans }]
          }
        ]}
      >
        <TouchableOpacity
          onPress={confirmDelete}
          style={styles.deleteButton}
        >
          <Text style={styles.deleteText}>Delete</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  };




  const renderRecordingItem = useCallback(({ item }: { item: RecordingHistory }) => (
    <Swipeable
      ref={(ref) => {
        if (ref && !openSwipeableRef.current) {
          openSwipeableRef.current = ref;
        }
      }}
      renderRightActions={(progress, dragX) => 
        renderRightActions(progress, dragX, item.id)
      }
      onSwipeableOpen={(direction) => {
        // Close previous swipeable if it's different from current one

      }}
      onSwipeableClose={() => {
        if (openSwipeableRef.current) {
          openSwipeableRef.current = null;
        }
      }}
      overshootRight={false}
    >
        <TouchableOpacity 
        style={styles.recordingItem} 
        onPress={() => {
          closeCurrentSwipeable();
          onViewRecording(item);
        }}
      >
        <View style={styles.recordingHeader}>
          <Text style={styles.dateText}>
            {format(new Date(item.date), 'MMM dd, yyyy HH:mm')}
          </Text>
          <Text style={styles.scoreText}>
            Score: {item.analysis.mos_score}/5
          </Text>
        </View>
        
        <View style={styles.recordingDetails}>
          <Text style={styles.durationText}>
            Duration: {Math.floor(item.duration / 60)}:
            {(item.duration % 60).toString().padStart(2, '0')}
          </Text>
          <Text style={styles.wordCountText}>
            Words: {item.analysis?.metrics?.wordCount ?? 0}
          </Text>
        </View>
      </TouchableOpacity>
    </Swipeable>
  ), [onViewRecording, onDeleteRecording]);


  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Recording History</Text>
        <TouchableOpacity 
          style={styles.newRecordingButton}
          onPress={onNewRecording}
        >
          <Text style={styles.newRecordingButtonText}>New Recording</Text>
        </TouchableOpacity>
      </View>

      {recordings.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>
            No recordings yet. Tap "New Recording" to get started!
          </Text>
        </View>
      ) : (
        <FlatList
          data={recordings}
          renderItem={renderRecordingItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          onScrollBeginDrag={closeCurrentSwipeable}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f7',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  newRecordingButton: {
    backgroundColor: '#6200ee',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  newRecordingButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  listContainer: {
    padding: 16,
  },
  recordingItem: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.41,
  },
  recordingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  dateText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
  },
  scoreText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6200ee',
  },
  recordingDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  durationText: {
    color: '#666',
  },
  wordCountText: {
    color: '#666',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyStateText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  deleteAction: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 100,
    backgroundColor: '#ff4444',
  },
  deleteButton: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  deleteText: {
    color: 'white',
    fontWeight: '600',
    padding: 20,
  },

});


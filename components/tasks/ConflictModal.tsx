import React from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';

interface ConflictLine { raw: string; kind: 'header' | 'bullet' | 'time' | 'other'; title?: string; timeText?: string }
interface ConflictBlock { header?: string; lines: ConflictLine[] }

interface Props {
  visible: boolean;
  blocks: ConflictBlock[];
  raw: string;
  onClose: () => void; // chỉ đóng, không cho tiếp tục
}

const ConflictModal: React.FC<Props> = ({ visible, blocks, onClose }) => {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.backdrop}>
        <View style={styles.container}>
          <Text style={styles.title}>Trùng thời gian ⛔</Text>
          <ScrollView style={{ maxHeight: 380 }}>
            {blocks.map((b, i) => (
              <View key={i} style={styles.block}> 
                {b.header && <Text style={styles.header}>{b.header}</Text>}
                {b.lines.filter(l=>l.kind!=='header').map((l, idx) => {
                  if (l.kind === 'bullet') {
                    return <Text key={idx} style={styles.bullet}><Text style={styles.bulletDot}>• </Text><Text style={styles.taskTitle}>{l.title}</Text></Text>;
                  }
                  if (l.kind === 'time') {
                    // highlight hours
                    return <Text key={idx} style={styles.time}>{l.raw}</Text>;
                  }
                  return <Text key={idx} style={styles.other}>{l.raw}</Text>;
                })}
              </View>
            ))}
          </ScrollView>
          <View style={styles.actionsSingle}>
            <TouchableOpacity style={[styles.btn, styles.close]} onPress={onClose}>
              <Text style={styles.btnText}>ĐÓNG</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: { flex:1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems:'center', justifyContent:'center', padding:16 },
  container: { backgroundColor:'#fff', borderRadius:12, width:'100%', padding:16, elevation:6 },
  title: { fontSize:18, fontWeight:'700', marginBottom:8, color:'#d9534f' },
  block: { marginBottom:14 },
  header: { fontWeight:'600', color:'#0057d9', marginBottom:4 },
  bullet: { marginLeft:0, marginTop:4, color:'#222', fontWeight:'500' },
  bulletDot: { color:'#777' },
  taskTitle: { color:'#8a2be2' },
  time: { marginLeft:10, color:'#e67e22' },
  other: { marginLeft:10, color:'#444' },
  actionsSingle: { flexDirection:'row', justifyContent:'flex-end', marginTop:12 },
  btn: { paddingVertical:10, paddingHorizontal:18, borderRadius:6 },
  close: { backgroundColor:'#d9534f' },
  btnText: { color:'#fff', fontWeight:'600' }
});

export default ConflictModal;
import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';

export type AlertTone = 'error' | 'warning' | 'success' | 'info';
interface ButtonDef { text: string; onPress: () => void; tone?: AlertTone | 'cancel' | 'destructive'; }
interface Props {
  visible: boolean;
  tone: AlertTone;
  title: string;
  message: string;
  buttons: ButtonDef[];
  onClose: () => void;
}

const toneColors: Record<AlertTone, { color: string; bg: string }> = {
  error: { color: '#d32f2f', bg: '#fdecea' },
  warning: { color: '#ed6c02', bg: '#fff4e5' },
  success: { color: '#2e7d32', bg: '#e8f5e9' },
  info: { color: '#1565c0', bg: '#e3f2fd' },
};

const TaskAlertModal: React.FC<Props> = ({ visible, tone, title, message, buttons, onClose }) => {
  const t = toneColors[tone];
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.box,{ borderColor: t.color}]}> 
          <Text style={[styles.title,{ color: t.color }]}>{title}</Text>
          <ScrollView style={styles.messageWrap} contentContainerStyle={{ paddingRight:6 }}>
            <Text style={styles.message}>{message}</Text>
          </ScrollView>
          <View style={styles.actions}>
            {buttons.map((b,i)=>(
              <TouchableOpacity
                key={i}
                onPress={()=>{ onClose(); b.onPress(); }}
                style={[styles.btn, b.tone==='destructive'?styles.des: b.tone==='cancel'?styles.cancel: styles.primary]}
              >
                <Text style={styles.btnText}>{b.text}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop:{ flex:1, backgroundColor:'rgba(0,0,0,0.45)', justifyContent:'center', alignItems:'center', padding:18 },
  box:{ width:'90%', backgroundColor:'#fff', borderRadius:14, padding:18, borderWidth:2 },
  title:{ fontSize:18, fontWeight:'700', marginBottom:10 },
  message:{ fontSize:15, lineHeight:21, color:'#222' },
  messageWrap: { maxHeight: 320 },
  actions:{ flexDirection:'row', justifyContent:'flex-end', flexWrap:'wrap', marginTop:16 },
  btn:{ paddingHorizontal:14, paddingVertical:10, borderRadius:6, marginLeft:10, marginTop:6 },
  primary:{ backgroundColor:'#1565c0' },
  cancel:{ backgroundColor:'#607d8b' },
  des:{ backgroundColor:'#d32f2f' },
  btnText:{ color:'#fff', fontWeight:'600' },
});

export default TaskAlertModal;
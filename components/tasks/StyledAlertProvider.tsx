import React, { createContext, useContext, useState, ReactNode } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';

interface AlertButton { text: string; style?: 'cancel' | 'destructive' | 'default'; onPress?: () => void }
interface AlertOptions { title?: string; message?: string; buttons?: AlertButton[]; tone?: 'error' | 'warning' | 'success' | 'info' }

interface AlertContextValue { show: (opts: AlertOptions) => void }
const AlertCtx = createContext<AlertContextValue | null>(null);

export const useStyledAlert = () => {
  const ctx = useContext(AlertCtx);
  if (!ctx) throw new Error('useStyledAlert must be inside provider');
  return ctx;
};

const toneMap = {
  error: { color:'#d9534f', bg:'#fdecea' },
  warning: { color:'#e67e22', bg:'#fef4e6' },
  success: { color:'#2e7d32', bg:'#e8f5e9' },
  info: { color:'#1e88e5', bg:'#e3f2fd' },
};

export const StyledAlertProvider = ({ children }: { children: ReactNode }) => {
  const [visible, setVisible] = useState(false);
  const [data, setData] = useState<AlertOptions | null>(null);
  const show = (opts: AlertOptions) => { setData(opts); setVisible(true); };
  const close = () => setVisible(false);
  const tone = (data?.tone && toneMap[data.tone]) || toneMap.info;
  return (
    <AlertCtx.Provider value={{ show }}>
      {children}
      <Modal visible={visible} transparent animationType="fade">
        <View style={styles.backdrop}>
          <View style={styles.box}>
            {data?.title && <Text style={[styles.title,{color:tone.color}]}>{data.title}</Text>}
            <ScrollView style={{maxHeight:300}}>
              {data?.message && <Text style={styles.message}>{data.message}</Text>}
            </ScrollView>
            <View style={styles.btnRow}>
              {(data?.buttons || [{ text:'Đóng', style:'default', onPress: close }]).map((b,i)=>(
                <TouchableOpacity
                  key={i}
                  style={[styles.btn, b.style==='destructive'?styles.btnDes: b.style==='cancel'?styles.btnCancel: styles.btnPrimary]}
                  onPress={()=>{ close(); b.onPress?.(); }}>
                  <Text style={styles.btnText}>{b.text}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </Modal>
    </AlertCtx.Provider>
  );
};

const styles = StyleSheet.create({
  backdrop:{flex:1,backgroundColor:'rgba(0,0,0,0.45)',justifyContent:'center',alignItems:'center',padding:18},
  box:{width:'100%',backgroundColor:'#fff',borderRadius:14,padding:18,elevation:6},
  title:{fontSize:18,fontWeight:'700',marginBottom:8},
  message:{fontSize:15,lineHeight:21,color:'#222'},
  btnRow:{flexDirection:'row',justifyContent:'flex-end',marginTop:16,flexWrap:'wrap'},
  btn:{paddingHorizontal:14,paddingVertical:10,borderRadius:6,marginLeft:10,marginTop:6},
  btnPrimary:{backgroundColor:'#1e88e5'},
  btnCancel:{backgroundColor:'#607d8b'},
  btnDes:{backgroundColor:'#d9534f'},
  btnText:{color:'#fff',fontWeight:'600'},
});

import React, { useEffect, useMemo, useState } from 'react';
import { SafeAreaView, View, Text, TouchableOpacity, StyleSheet, FlatList, ActivityIndicator, Alert, Switch } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../context/ThemeContext';
import { useTasks } from '../hooks/useTasks';
import { useRecurrences } from '../hooks/useRecurrences';
import type { Task } from '../types/Task';
import type { Recurrence } from '../types/Recurrence';
import { plannedHabitOccurrences, isHabitDoneOnDate, markHabitToday, unmarkHabitToday, markHabitRange, unmarkHabitRange } from '../utils/habits';

export default function CompletedScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const s = createStyles(isDark);
  const { tasks, loadTasks, editTask } = useTasks();
  const { recurrences, loadRecurrences } = useRecurrences();

  const [loading, setLoading] = useState(true);
  // End-of-day cutoff string stored as 'HH:mm' in AsyncStorage
  const [cutoffString, setCutoffString] = useState<string>('23:00');
  // whether the cutoff feature is enabled (default OFF for new installs)
  const [cutoffEnabled, setCutoffEnabled] = useState<boolean>(false);
  // show native time picker
  const [timePickerVisible, setTimePickerVisible] = useState(false);

  const CUT_OFF_KEY = 'endOfDayCutoff';
  const CUT_OFF_ENABLED_KEY = 'endOfDayCutoffEnabled';
  const AsyncStorage = require('@react-native-async-storage/async-storage').default;
  const DateTimePickerModal = require('react-native-modal-datetime-picker').default;

  useEffect(() => {
    let mounted = true;
    const loadAll = async () => {
      setLoading(true);
      try {
        await Promise.all([loadTasks(), loadRecurrences()]);
        // load cutoff and enabled flag
        try {
          const [v, enabled] = await Promise.all([
            AsyncStorage.getItem(CUT_OFF_KEY),
            AsyncStorage.getItem(CUT_OFF_ENABLED_KEY),
          ]);
          if (mounted && v) setCutoffString(v);
          // Treat explicit 'true' as enabled; missing key -> default OFF for new installs
          if (mounted) setCutoffEnabled(enabled === 'true');
        } catch (e) {
          // ignore
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };
    loadAll();
    return () => { mounted = false; };
  }, []);

  type PendingItem =
    | { kind: 'task'; task: Task }
    | { kind: 'rec-occ'; task: Task; rec: Recurrence; start: number; end?: number }
    | { kind: 'rec-merge'; task: Task; rec: Recurrence; from: number; to: number };

  const now = Date.now();

  const pendingItems: PendingItem[] = useMemo(() => {
    const out: PendingItem[] = [];
    // Non-recurring tasks
    for (const t of tasks) {
      try {
        if (!t.recurrence_id) {
          // include non-recurring tasks whose start_at <= now and not completed
          const s = t.start_at ? Date.parse(t.start_at) : (t.end_at ? Date.parse(t.end_at) : null);
          if ((s == null || s <= now) && t.status !== 'completed') {
            out.push({ kind: 'task', task: t });
          }
        } else {
          const rec = recurrences.find((r) => r.id === t.recurrence_id);
          if (!rec) continue;
          const occs = plannedHabitOccurrences(t, rec).filter(o => o.startAt <= now);
          if (!occs.length) continue;
          const merge = (rec as any).merge_streak === 1;
          if (merge) {
            // if any occurrence up to now is not completed, show one merged item
            const from = occs[0].startAt;
            const to = occs[occs.length - 1].endAt;
            out.push({ kind: 'rec-merge', task: t, rec, from, to });
          } else {
            // push each occurrence that is not completed
            for (const o of occs) {
              out.push({ kind: 'rec-occ', task: t, rec, start: o.startAt, end: o.endAt });
            }
          }
        }
      } catch (e) {
        // ignore per-task errors
      }
    }
    // Sort by start ascending
    out.sort((a, b) => {
      const aStart = ('start' in a) ? a.start : ('from' in a ? a.from : (a.task.start_at ? Date.parse(a.task.start_at) : 0));
      const bStart = ('start' in b) ? b.start : ('from' in b ? b.from : (b.task.start_at ? Date.parse(b.task.start_at) : 0));
      return aStart - bStart;
    });
    return out;
  }, [tasks, recurrences]);

  const formatYMD = (ms: number) => {
    const d = new Date(ms);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${day}/${m}/${y}`;
  };

  const toggleItem = async (item: PendingItem) => {
    // This function is no longer used for immediate toggle; kept for compatibility but does nothing.
    return;
  };

  // Selection state: track selected pending item keys
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  // Visible items after filtering out already-completed recurring occurrences
  const [visibleItems, setVisibleItems] = useState<PendingItem[]>([]);

  useEffect(() => {
    let mounted = true;
    const filterVisible = async () => {
      const out: PendingItem[] = [];
      for (const it of pendingItems) {
        try {
          if (it.kind === 'rec-occ') {
            const done = await isHabitDoneOnDate(it.rec.id!, new Date(it.start));
            if (!done) out.push(it);
          } else if (it.kind === 'rec-merge') {
            // for merged ranges, include only if there's at least one not-done occurrence in the range
            const occs = plannedHabitOccurrences(it.task, it.rec).filter(o => o.startAt >= it.from && o.startAt <= it.to);
            const notDone: Array<{ startAt: number; endAt: number }> = [];
            for (const o of occs) {
              const done = await isHabitDoneOnDate(it.rec.id!, new Date(o.startAt));
              if (!done) notDone.push(o);
            }
            if (notDone.length) {
              const from = notDone[0].startAt;
              const to = notDone[notDone.length - 1].endAt;
              out.push({ kind: 'rec-merge', task: it.task, rec: it.rec, from, to });
            }
          } else {
            // non-recurring task
            out.push(it);
          }
        } catch (e) {
          // if any check fails, conservatively include the item
          out.push(it);
        }
      }
      if (mounted) setVisibleItems(out);
    };
    filterVisible();
    return () => { mounted = false; };
  }, [pendingItems]);

  const itemKey = (it: PendingItem, idx?: number) => {
    if (it.kind === 'task') return `task-${it.task.id}`;
    if (it.kind === 'rec-occ') return `rec-occ-${it.start}-${it.task.id}`;
    return `rec-merge-${it.from}-${it.to}-${it.task.id}`;
  };

  const toggleSelection = (it: PendingItem) => {
    const k = itemKey(it);
    setSelectedKeys(prev => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  // Toggle select all / clear all (over visible items)
  const toggleSelectAll = () => {
    if (!visibleItems.length) return;
    if (selectedKeys.size === visibleItems.length) {
      setSelectedKeys(new Set());
      return;
    }
    const all = new Set(visibleItems.map(it => itemKey(it)));
    setSelectedKeys(all);
  };

  // Complete all selected items (only when user presses Hoàn thành)
  const completeSelected = async () => {
    if (!selectedKeys.size) return;
    setLoading(true);
    try {
      for (const it of visibleItems) {
        const k = itemKey(it);
        if (!selectedKeys.has(k)) continue;
        if (it.kind === 'task') {
          // compute completion metadata considering cutoff for tasks that belong to today
          const nowMs = Date.now();
          const completedAt = new Date().toISOString();
          // determine scheduled time (prefer start_at, then end_at)
          const dateMs = it.task.start_at ? Date.parse(it.task.start_at) : (it.task.end_at ? Date.parse(it.task.end_at) : null);
          let extra: any = { status: 'completed', completed_at: completedAt };
          try {
            if (dateMs != null && cutoffEnabled) {
              const taskDate = new Date(dateMs);
              const today = new Date(nowMs);
              const sameDay = taskDate.getFullYear() === today.getFullYear() && taskDate.getMonth() === today.getMonth() && taskDate.getDate() === today.getDate();
              // build cutoff ms for the task's date (if cutoffString valid)
              const [hStr, mStr] = (cutoffString || '23:00').split(':');
              const h = parseInt(hStr || '23', 10);
              const m = parseInt(mStr || '0', 10);
              if (!Number.isNaN(h) && !Number.isNaN(m) && sameDay) {
                const cutoffForDate = new Date(taskDate.getFullYear(), taskDate.getMonth(), taskDate.getDate(), h, m).getTime();
                // effective deadline is the later of the task scheduled time and the cutoff
                const effectiveDeadline = Math.max(dateMs, cutoffForDate);
                const diffMinutes = Math.round((nowMs - effectiveDeadline) / 60000);
                const completion_status = diffMinutes <= 0 ? 'on_time' : 'late';
                extra = { ...extra, completion_diff_minutes: diffMinutes, completion_status };
              }
            }
          } catch (e) {
            // ignore metadata failures
          }
          await editTask(it.task.id, extra);
        } else if (it.kind === 'rec-occ') {
          const date = new Date(it.start);
          const done = await isHabitDoneOnDate(it.rec.id!, date);
          if (!done) await markHabitToday(it.rec.id!, date);
        } else if (it.kind === 'rec-merge') {
          await markHabitRange(it.rec.id!, new Date(it.from), new Date(it.to), it.task, it.rec);
  }
      }
      await Promise.all([loadTasks(), loadRecurrences()]);
      // clear selection
      setSelectedKeys(new Set());
    } catch (e:any) {
      Alert.alert('Lỗi', String(e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={s.close}>Đóng</Text>
        </TouchableOpacity>

        <Text style={s.title}>Hoàn thành</Text>

        <View style={{ width: 40 }} />
      </View>

      {/* Content: pending completions list */}
      <View style={[s.container, { padding: 12 }]}>
        {/* Cutoff editor with enable switch and time picker */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginHorizontal: 4, marginBottom: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={{ color: '#666', marginRight: 8 }}>Ngưỡng cuối ngày:</Text>
            <Switch value={cutoffEnabled} onValueChange={async (v) => {
              setCutoffEnabled(v);
              try {
                await AsyncStorage.setItem(CUT_OFF_ENABLED_KEY, v ? 'true' : 'false');
              } catch (e) {
                // ignore
              }
            }} />
          </View>
          <TouchableOpacity onPress={() => setTimePickerVisible(true)} disabled={!cutoffEnabled} style={{ paddingHorizontal: 12, paddingVertical: 6, backgroundColor: cutoffEnabled ? '#E5E7EB' : '#F1F5F9', borderRadius: 8 }}>
            <Text style={{ color: '#111' }}>{cutoffString || '23:00'}</Text>
          </TouchableOpacity>
        </View>
        {loading ? (
          <ActivityIndicator />
        ) : (
          <>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text style={{ fontWeight: '700' }}>Hoàn thành các mục</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity onPress={toggleSelectAll} style={{ paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#E5E7EB', borderRadius: 8 }}>
                  <Text style={{ color: '#111' }}>{selectedKeys.size === visibleItems.length && visibleItems.length > 0 ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={completeSelected} disabled={selectedKeys.size === 0} style={{ paddingHorizontal: 12, paddingVertical: 6, backgroundColor: selectedKeys.size === 0 ? '#94A3B8' : '#2563EB', borderRadius: 8 }}>
                  <Text style={{ color: '#fff' }}>Hoàn thành</Text>
                </TouchableOpacity>
              </View>
            </View>

            <FlatList
              data={visibleItems}
              ListEmptyComponent={<Text style={{ color: '#666' }}>Không có mục nào để hoàn thành</Text>}
              keyExtractor={(it, idx) => itemKey(it, idx)}
              renderItem={({ item }) => {
                const k = itemKey(item);
                const checked = selectedKeys.has(k);
                if (item.kind === 'task') {
                  const dateMs = item.task.start_at ? Date.parse(item.task.start_at) : (item.task.end_at ? Date.parse(item.task.end_at) : null);
                  const dateLabel = dateMs ? formatYMD(dateMs) : null;
                  return (
                    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderColor: '#eee' }}>
                      <View style={{ flex: 1, marginRight: 12 }}>
                        <Text style={{ fontSize: 16 }} numberOfLines={2} ellipsizeMode="tail">{item.task.title}</Text>
                        {dateLabel ? <Text style={{ color: '#666' }} numberOfLines={1}>{dateLabel}</Text> : null}
                      </View>
                      <TouchableOpacity onPress={() => toggleSelection(item)} style={{ width: 36, alignItems: 'center' }}>
                        {checked ? (
                          <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: '#16a34a', justifyContent: 'center', alignItems: 'center' }}>
                            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>✓</Text>
                          </View>
                        ) : (
                          <View style={{ width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: '#94A3B8', justifyContent: 'center', alignItems: 'center' }} />
                        )}
                      </TouchableOpacity>
                    </View>
                  );
                }
                if (item.kind === 'rec-occ') {
                  const ymd = formatYMD(item.start);
                  return (
                    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderColor: '#eee' }}>
                      <View style={{ flex: 1, marginRight: 12 }}>
                        <Text style={{ fontSize: 16 }} numberOfLines={2} ellipsizeMode="tail">{item.task.title}</Text>
                        <Text style={{ color: '#666' }} numberOfLines={1}>{ymd}</Text>
                      </View>
                      <TouchableOpacity onPress={() => toggleSelection(item)} style={{ width: 36, alignItems: 'center' }}>
                        {checked ? (
                          <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: '#16a34a', justifyContent: 'center', alignItems: 'center' }}>
                            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>✓</Text>
                          </View>
                        ) : (
                          <View style={{ width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: '#94A3B8', justifyContent: 'center', alignItems: 'center' }} />
                        )}
                      </TouchableOpacity>
                    </View>
                  );
                }
                // rec-merge
                const fromLabel = formatYMD(item.from);
                const toLabel = formatYMD(item.to);
                return (
                  <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderColor: '#eee' }}>
                    <View style={{ flex: 1, marginRight: 12 }}>
                      <Text style={{ fontSize: 16 }} numberOfLines={2} ellipsizeMode="tail">{item.task.title} (gộp)</Text>
                      <Text style={{ color: '#666' }} numberOfLines={1}>{fromLabel} — {toLabel}</Text>
                    </View>
                    <TouchableOpacity onPress={() => toggleSelection(item)} style={{ width: 36, alignItems: 'center' }}>
                      {checked ? (
                        <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: '#16a34a', justifyContent: 'center', alignItems: 'center' }}>
                          <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>✓</Text>
                        </View>
                      ) : (
                        <View style={{ width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: '#94A3B8', justifyContent: 'center', alignItems: 'center' }} />
                      )}
                    </TouchableOpacity>
                  </View>
                );
              }}
            />
          </>
        )}
      </View>

      {/* Native time picker (modal) */}
      {timePickerVisible ? (
        <DateTimePickerModal
          isVisible={timePickerVisible}
          mode="time"
          is24Hour
          date={(() => {
            const [hh, mm] = (cutoffString || '23:00').split(':').map(s => parseInt(s || '0', 10));
            const now = new Date();
            return new Date(now.getFullYear(), now.getMonth(), now.getDate(), Number.isFinite(hh) ? hh : 23, Number.isFinite(mm) ? mm : 0);
          })()}
          onConfirm={async (d: Date) => {
            const pad = (n: number) => String(n).padStart(2, '0');
            const newStr = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
            setCutoffString(newStr);
            try {
              await AsyncStorage.setItem(CUT_OFF_KEY, newStr);
            } catch (e) {
              // ignore
            }
            setTimePickerVisible(false);
          }}
          onCancel={() => setTimePickerVisible(false)}
        />
      ) : null}
    </SafeAreaView>
  );
}

const createStyles = (isDark: boolean) =>
  StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: isDark ? '#071226' : '#F6F7FB',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? '#0f1724' : '#e5e7eb',
      backgroundColor: isDark ? '#071226' : '#F6F7FB',
    },
    close: {
      color: isDark ? '#60A5FA' : '#2563EB',
      fontWeight: '700',
      fontSize: 16,
    },
    title: {
      fontSize: 18,
      fontWeight: '700',
      color: isDark ? '#E6EEF8' : '#111',
    },
    container: {
      flex: 1,
      backgroundColor: isDark ? '#071226' : '#fff',
      borderRadius: 12,
      marginHorizontal: 16,
      marginTop: 16,
      borderWidth: 1,
      borderColor: isDark ? '#0f1724' : '#E5E7EB',
      overflow: 'hidden',
    },
  });

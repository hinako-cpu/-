/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plus, 
  Trash2, 
  ChevronLeft, 
  ChevronRight, 
  Calculator, 
  Calendar as CalendarIcon,
  Info,
  ExternalLink,
  Download
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// --- Types ---

interface ChildcareRecord {
  id: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
}

interface PlanResult {
  totalFee: number;
  nationalSubsidy: number;
  wardSubsidy: number;
  selfPay: number;
}

interface MonthlySummary {
  totalDays: number;
  totalHours: number;
  hasEarly: boolean;
  hasLate: boolean;
  spot: PlanResult;
  regular: PlanResult;
}

// --- Constants ---

const HOURLY_RATE = 500;
const SLOT_FEE = 500; // Early/Late slot fee
const NATIONAL_SUBSIDY_DAILY = 450;
const NATIONAL_SUBSIDY_MAX = 11300;
const WARD_SUBSIDY_THRESHOLD = 13500;
const TOTAL_SUBSIDY_MAX = 15000;

const REGULAR_BASE_FEE = 20000;
const REGULAR_ADDON_EARLY = 500;
const REGULAR_ADDON_LATE = 500;

// --- Helper Functions ---

const isEarlySlot = (start: string): boolean => {
  if (!start) return false;
  const [h, m] = start.split(':').map(Number);
  return h < 9;
};

const isLateSlot = (end: string): boolean => {
  if (!end) return false;
  const [h, m] = end.split(':').map(Number);
  // Using 17:00 as the boundary for late slot
  return h > 17 || (h === 17 && m > 0);
};

const calculateSpotFee = (r: ChildcareRecord): number => {
  const early = isEarlySlot(r.startTime);
  const late = isLateSlot(r.endTime);
  
  // Clip times for hourly calculation if they fall into slots
  // Assuming hourly rate applies to 9:00 - 17:00
  const [startH, startM] = r.startTime.split(':').map(Number);
  const [endH, endM] = r.endTime.split(':').map(Number);

  const effectiveStartMins = Math.max(startH * 60 + startM, 9 * 60);
  const effectiveEndMins = Math.min(endH * 60 + endM, 17 * 60);
  
  const standardHours = Math.max(0, (effectiveEndMins - effectiveStartMins) / 60);
  
  return (early ? SLOT_FEE : 0) + (late ? SLOT_FEE : 0) + (standardHours * HOURLY_RATE);
};

const calculateDuration = (start: string, end: string): number => {
  if (!start || !end) return 0;
  const [startH, startM] = start.split(':').map(Number);
  const [endH, endM] = end.split(':').map(Number);
  const durationMinutes = (endH * 60 + endM) - (startH * 60 + startM);
  return Math.max(0, durationMinutes / 60);
};

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(amount);
};

// --- Components ---

export default function App() {
  const [records, setRecords] = useState<ChildcareRecord[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [displayPlan, setDisplayPlan] = useState<'spot' | 'regular'>('spot');
  const [profileName, setProfileName] = useState(() => localStorage.getItem('childcare_profile_name') || 'お子様1');

  // Sync profile name to localStorage
  useEffect(() => {
    localStorage.setItem('childcare_profile_name', profileName);
  }, [profileName]);

  // Load data from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('childcare_records_v2');
    if (saved) {
      try {
        setRecords(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to parse saved records', e);
      }
    } else {
      const old = localStorage.getItem('childcare_records');
      if (old) {
        try {
          const parsed = JSON.parse(old);
          setRecords(parsed);
          localStorage.setItem('childcare_records_v2', old);
        } catch (e) {
          console.error(e);
        }
      }
    }
  }, []);

  // Save data to localStorage
  useEffect(() => {
    localStorage.setItem('childcare_records_v2', JSON.stringify(records));
  }, [records]);

  const filteredRecords = useMemo(() => {
    return records
      .filter(r => r.date.startsWith(selectedMonth))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [records, selectedMonth]);

  const summary = useMemo((): MonthlySummary => {
    const distinctDates = new Set(filteredRecords.map(r => r.date));
    const totalDays = distinctDates.size;
    
    let totalHours = 0;
    let spotTotalFee = 0;
    let hasEarly = false;
    let hasLate = false;

    filteredRecords.forEach(r => {
      totalHours += calculateDuration(r.startTime, r.endTime);
      spotTotalFee += calculateSpotFee(r);
      if (isEarlySlot(r.startTime)) hasEarly = true;
      if (isLateSlot(r.endTime)) hasLate = true;
    });

    const calculatePlan = (fee: number): PlanResult => {
      const nationalSubsidy = Math.min(totalDays * NATIONAL_SUBSIDY_DAILY, NATIONAL_SUBSIDY_MAX);
      let wardSubsidy = 0;
      if (fee > WARD_SUBSIDY_THRESHOLD) {
        // 区の補助金は利用料が13,500円を超えた分について、
        // 国の補助金と合わせて合計15,000円になるまで支給
        const maxPossibleWard = TOTAL_SUBSIDY_MAX - nationalSubsidy;
        wardSubsidy = Math.min(fee - WARD_SUBSIDY_THRESHOLD, maxPossibleWard);
      }
      const selfPay = Math.max(0, fee - (nationalSubsidy + wardSubsidy));
      return { totalFee: fee, nationalSubsidy, wardSubsidy, selfPay };
    };

    const regularFee = REGULAR_BASE_FEE + (hasEarly ? REGULAR_ADDON_EARLY : 0) + (hasLate ? REGULAR_ADDON_LATE : 0);

    return {
      totalDays,
      totalHours,
      hasEarly,
      hasLate,
      spot: calculatePlan(spotTotalFee),
      regular: calculatePlan(regularFee)
    };
  }, [filteredRecords]);

  const currentResult = displayPlan === 'spot' ? summary.spot : summary.regular;
  const isBetterPlan = summary.spot.selfPay <= summary.regular.selfPay ? 'spot' : 'regular';
  const delta = Math.abs(summary.spot.selfPay - summary.regular.selfPay);

  const addRecord = () => {
    const lastRecord = filteredRecords[filteredRecords.length - 1];
    let nextDate = `${selectedMonth}-01`;
    
    if (lastRecord) {
      const date = new Date(lastRecord.date);
      date.setDate(date.getDate() + 1);
      nextDate = date.toISOString().split('T')[0];
    }

    const newRecord: ChildcareRecord = {
      id: crypto.randomUUID(),
      date: nextDate,
      startTime: "14:00",
      endTime: "17:00"
    };
    setRecords([...records, newRecord]);
  };

  const updateRecord = (id: string, updates: Partial<ChildcareRecord>) => {
    setRecords(records.map(r => r.id === id ? { ...r, ...updates } : r));
  };

  const deleteRecord = (id: string) => {
    setRecords(records.filter(r => r.id !== id));
  };

  const changeMonth = (offset: number) => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const date = new Date(year, month - 1 + offset, 1);
    setSelectedMonth(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
  };

  const clearMonthRecords = () => {
    if (window.confirm(`${selectedMonth}の記録をすべて削除しますか？`)) {
      setRecords(records.filter(r => !r.date.startsWith(selectedMonth)));
    }
  };

  const clearAllRecords = () => {
    if (window.confirm("すべての記録を削除しますか？この操作は取り消せません。")) {
      setRecords([]);
      localStorage.removeItem('childcare_records_v2');
    }
  };

  const exportCSV = () => {
    const headers = ["日付", "開始", "終了", "時間", "金額(スポット基準)"];
    const rows = filteredRecords.map(r => {
      const duration = calculateDuration(r.startTime, r.endTime);
      return [r.date, r.startTime, r.endTime, duration.toFixed(1), calculateSpotFee(r).toString()];
    });
    
    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `childcare_${selectedMonth}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans selection:bg-amber-200">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-400 rounded-xl flex items-center justify-center text-white shadow-sm">
                <Calculator size={24} />
              </div>
              <div className="flex flex-col">
                <h1 className="text-xl font-bold tracking-tight text-slate-900 leading-tight">
                  たんぽぽ組 保育料計算機
                </h1>
                <input 
                  type="text"
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  placeholder="お子様のお名前"
                  className="text-[10px] bg-transparent border-none p-0 text-slate-400 hover:text-slate-600 focus:text-amber-600 transition-colors w-32 focus:ring-0"
                />
              </div>
            </div>
          
          <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-lg">
            <button 
              onClick={() => changeMonth(-1)}
              className="p-2 hover:bg-white rounded-md transition-colors text-slate-600"
            >
              <ChevronLeft size={20} />
            </button>
            <div className="px-4 py-1 font-medium min-w-[120px] text-center">
              {(() => {
                const [y, m] = selectedMonth.split('-');
                return `${y}年 ${m}月`;
              })()}
            </div>
            <button 
              onClick={() => changeMonth(1)}
              className="p-2 hover:bg-white rounded-md transition-colors text-slate-600"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        {/* Recommendation / Comparison Section */}
        {filteredRecords.length > 0 && (
          <section className="bg-white p-6 rounded-3xl border-2 border-amber-400 shadow-xl shadow-amber-900/5 overflow-hidden relative">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <Calculator size={80} />
            </div>
            <div className="flex flex-col md:flex-row gap-6 items-center">
              <div className="flex-1 space-y-4">
                <div className="inline-flex items-center gap-2 bg-amber-100 text-amber-700 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
                  比較結果とお得なプラン
                </div>
                <h2 className="text-2xl font-black text-slate-900">
                  {isBetterPlan === 'spot' ? '「スポット利用」' : '「定期利用」'}がお得です！
                </h2>
                <p className="text-slate-600 leading-relaxed">
                  今の利用状況では、{isBetterPlan === 'spot' ? 'スポット利用' : '定期利用'}の方が月額
                  <span className="font-bold text-amber-600 px-1 text-lg">{formatCurrency(delta)}</span>
                  安くなります。
                </p>
                <div className="flex flex-wrap gap-2 pt-2">
                  <button 
                    onClick={() => setDisplayPlan('spot')}
                    className={`px-4 py-3 rounded-2xl border-2 transition-all text-left ${displayPlan === 'spot' ? 'border-amber-400 bg-amber-50' : 'border-slate-100 hover:border-slate-200'}`}
                  >
                    <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">スポット利用時</p>
                    <p className="text-xl font-black">{formatCurrency(summary.spot.selfPay)}</p>
                  </button>
                  <button 
                    onClick={() => setDisplayPlan('regular')}
                    className={`px-4 py-3 rounded-2xl border-2 transition-all text-left ${displayPlan === 'regular' ? 'border-amber-400 bg-amber-50' : 'border-slate-100 hover:border-slate-200'}`}
                  >
                    <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">定期利用時</p>
                    <p className="text-xl font-black">{formatCurrency(summary.regular.selfPay)}</p>
                  </button>
                </div>
              </div>
              <div className="bg-slate-900 text-white p-6 rounded-2xl md:w-64 space-y-3 shrink-0">
                <div className="flex items-center gap-2 text-amber-400 font-bold mb-2">
                  <Info size={16} />
                  <span>安くなるライン</span>
                </div>
                <p className="text-xs text-slate-300 leading-normal">
                  利用料の総額が <span className="text-white font-bold">13,500円〜17,200円</span> の間は「練馬区の補助金」がカバーするため、自己負担額が増えにくいラインです。
                </p>
                <p className="text-xs text-slate-300 leading-normal border-t border-slate-700 pt-3">
                  総額が <span className="text-white font-bold">17,200円</span> を超える頻度なら、早めに定期利用を検討するのがおすすめです。
                </p>
              </div>
            </div>
          </section>
        )}

        {/* Dashboard */}
        <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="col-span-1 md:col-span-4 bg-amber-400 p-8 rounded-3xl shadow-xl shadow-amber-200/50 text-amber-950 flex flex-col md:flex-row items-center justify-between gap-8"
          >
            <div className="text-center md:text-left space-y-1">
              <p className="text-amber-800/80 text-sm font-bold uppercase tracking-wider">現在の自己負担額 ({displayPlan === 'spot' ? 'スポット' : '定期利用'})</p>
              <h2 className="text-5xl md:text-7xl font-black">{formatCurrency(currentResult.selfPay)}</h2>
              <div className="flex gap-2 pt-2 justify-center md:justify-start">
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${summary.hasEarly ? 'bg-blue-600/20 text-blue-700' : 'bg-amber-500/30 text-amber-900/40'}`}>早預かりあり</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${summary.hasLate ? 'bg-emerald-600/20 text-emerald-700' : 'bg-amber-500/30 text-amber-900/40'}`}>遅預かりあり</span>
              </div>
            </div>
            
            <div className="flex flex-wrap justify-center gap-8 w-full md:w-auto border-t md:border-t-0 md:border-l border-amber-500/30 pt-8 md:pt-0 md:pl-12">
              <div className="text-center">
                <p className="text-amber-800 text-xs mb-1 font-medium">総預かり日数</p>
                <p className="text-3xl font-black">{summary.totalDays} <span className="text-xs font-normal opacity-70">日</span></p>
              </div>
              <div className="text-center">
                <p className="text-amber-800 text-xs mb-1 font-medium">合計時間</p>
                <p className="text-3xl font-black">{summary.totalHours.toFixed(1)} <span className="text-xs font-normal opacity-70">h</span></p>
              </div>
              <div className="text-center">
                <p className="text-amber-800 text-xs mb-1 font-medium">利用料総額</p>
                <p className="text-3xl font-black">{formatCurrency(currentResult.totalFee)}</p>
              </div>
            </div>
          </motion.div>

          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm col-span-1 md:col-span-2 flex flex-col justify-between">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                <Info size={18} />
              </div>
              <span className="text-xs text-slate-500 font-bold">国の補助金 (2号認定)</span>
            </div>
            <p className="text-2xl font-black text-slate-900">{formatCurrency(currentResult.nationalSubsidy)}</p>
            <p className="text-[10px] text-slate-400 mt-2">1日450円 / 月上限11,300円</p>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm col-span-1 md:col-span-2 flex flex-col justify-between">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                <Info size={18} />
              </div>
              <span className="text-xs text-slate-500 font-bold">練馬区の独自補助金</span>
            </div>
            <p className="text-2xl font-black text-slate-900">{formatCurrency(currentResult.wardSubsidy)}</p>
            <p className="text-[10px] text-slate-400 mt-2">国と合算で月上限15,000円まで</p>
          </div>
        </section>

        {/* Input Table */}
        <section className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 text-amber-600 rounded-lg">
                <CalendarIcon size={20} />
              </div>
              <h3 className="text-lg font-bold">利用状況の入力</h3>
            </div>
            <div className="flex items-center gap-3">
              <button 
                onClick={exportCSV}
                className="text-sm font-semibold text-slate-500 hover:text-slate-800 transition-colors flex items-center gap-2 px-4 py-2"
              >
                <Download size={16} />
                CSV出力
              </button>
              <button 
                onClick={addRecord}
                className="text-sm font-bold flex items-center gap-2 px-5 py-2.5 bg-amber-400 text-white rounded-xl hover:bg-amber-500 transition-all shadow-md shadow-amber-200 active:scale-95"
              >
                <Plus size={18} />
                記録を追加
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 border-b border-slate-100 uppercase tracking-widest text-[10px]">
                <tr>
                  <th className="px-6 py-4 text-left font-bold">日付</th>
                  <th className="px-6 py-4 text-left font-bold">開始</th>
                  <th className="px-6 py-4 text-left font-bold">終了</th>
                  <th className="px-6 py-4 text-left font-bold">区分</th>
                  <th className="px-6 py-4 text-right font-bold font-mono">利用時間</th>
                  <th className="px-6 py-4 text-right font-bold w-32">スポット額</th>
                  <th className="px-6 py-4 w-12"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <AnimatePresence initial={false}>
                  {filteredRecords.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-20 text-center text-slate-400">
                        <Info size={32} className="mx-auto mb-3 opacity-20" />
                        <p className="italic text-sm">記録がありません。「記録を追加」ボタンを押して入力を始めてください。</p>
                      </td>
                    </tr>
                  ) : (
                    filteredRecords.map((r) => {
                      const duration = calculateDuration(r.startTime, r.endTime);
                      const isEarly = isEarlySlot(r.startTime);
                      const isLate = isLateSlot(r.endTime);
                      return (
                        <motion.tr 
                          key={r.id}
                          layout
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="group hover:bg-slate-50/50 transition-colors"
                        >
                          <td className="px-6 py-3">
                            <input 
                              type="date" 
                              value={r.date}
                              onChange={(e) => updateRecord(r.id, { date: e.target.value })}
                              className="bg-transparent border-none focus:ring-2 focus:ring-amber-200 rounded px-2 font-medium"
                            />
                          </td>
                          <td className="px-6 py-3">
                            <input 
                              type="time" 
                              value={r.startTime}
                              onChange={(e) => updateRecord(r.id, { startTime: e.target.value })}
                              className={`bg-transparent border-none focus:ring-2 focus:ring-amber-200 rounded px-2 ${isEarly ? 'text-blue-600 font-bold' : ''}`}
                            />
                          </td>
                          <td className="px-6 py-3">
                            <input 
                              type="time" 
                              value={r.endTime}
                              onChange={(e) => updateRecord(r.id, { endTime: e.target.value })}
                              className={`bg-transparent border-none focus:ring-2 focus:ring-amber-200 rounded px-2 ${isLate ? 'text-emerald-600 font-bold' : ''}`}
                            />
                          </td>
                          <td className="px-6 py-3 text-[10px] space-x-1">
                            {isEarly && <span className="bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-bold">早預かり</span>}
                            {isLate && <span className="bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded font-bold">遅預かり</span>}
                          </td>
                          <td className="px-6 py-3 text-right font-bold text-slate-900">
                            {duration.toFixed(1)} h
                          </td>
                          <td className="px-6 py-3 text-right font-mono text-slate-500 group-hover:text-slate-900 transition-colors">
                            {formatCurrency(calculateSpotFee(r))}
                          </td>
                          <td className="px-6 py-3 text-center">
                            <button 
                              onClick={() => deleteRecord(r.id)}
                              className="text-slate-200 hover:text-red-500 transition-colors p-2"
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </motion.tr>
                      );
                    })
                  )}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
          
          {filteredRecords.length > 0 && (
            <div className="p-4 bg-slate-50/30 flex justify-between items-center">
              <button 
                onClick={clearAllRecords}
                className="text-xs font-medium text-slate-400 hover:text-red-500 transition-colors px-4 py-2"
              >
                全データをリセット
              </button>
              <button 
                onClick={addRecord}
                className="text-xs font-bold flex items-center gap-1.5 px-4 py-2 text-amber-600 hover:text-amber-700 transition-colors"
              >
                <Plus size={14} />
                さらに記録を追加
              </button>
            </div>
          )}
        </section>

        {/* Pricing Guide */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white p-8 rounded-3xl border border-slate-200 space-y-4">
            <h4 className="font-black text-xl flex items-center gap-2 text-slate-900 border-l-4 border-amber-400 pl-4">
              スポット利用
            </h4>
            <div className="space-y-3">
              <div className="flex justify-between items-center text-sm border-b border-slate-100 pb-2">
                <span className="text-slate-500">標準時間内 (1時間)</span>
                <span className="font-bold">500円</span>
              </div>
              <div className="flex justify-between items-center text-sm border-b border-slate-100 pb-2">
                <span className="text-slate-500 font-medium text-blue-600">早預かり (8:00〜)</span>
                <span className="font-bold">+500円 / 回</span>
              </div>
              <div className="flex justify-between items-center text-sm border-b border-slate-100 pb-2">
                <span className="text-slate-500 font-medium text-emerald-600">遅預かり (〜17:30)</span>
                <span className="font-bold">+500円 / 回</span>
              </div>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed pt-2">
              ※標準時間(9:00-17:00)以外は、利用時間に関わらず1回500円の固定料金として計算しています。
            </p>
          </div>

          <div className="bg-white p-8 rounded-3xl border border-slate-200 space-y-4 shadow-sm">
            <h4 className="font-black text-xl flex items-center gap-2 text-slate-900 border-l-4 border-indigo-500 pl-4">
              定期利用
            </h4>
            <div className="space-y-3">
              <div className="flex justify-between items-center text-sm border-b border-slate-100 pb-2">
                <span className="text-slate-500">月額基本料金</span>
                <span className="font-bold">20,000円</span>
              </div>
              <div className="flex justify-between items-center text-sm border-b border-slate-100 pb-2">
                <span className="text-slate-500 font-medium text-blue-600">早預かり利用あり</span>
                <span className="font-bold">+500円 / 月</span>
              </div>
              <div className="flex justify-between items-center text-sm border-b border-slate-100 pb-2">
                <span className="text-slate-500 font-medium text-emerald-600">遅預かり利用あり</span>
                <span className="font-bold">+500円 / 月</span>
              </div>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed pt-2">
              月内に一度でも早預かり・遅預かりを利用すると、それぞれの加算料金（月500円固定）が発生します。
            </p>
          </div>
        </section>

        {/* System Info */}
        <section className="bg-orange-50 p-8 rounded-3xl border border-orange-100 shadow-sm overflow-hidden relative">
          <div className="absolute top-0 right-0 w-64 h-64 bg-orange-200/20 rounded-full -translate-y-32 translate-x-32"></div>
          <div className="relative z-10 space-y-6">
            <h4 className="font-bold text-lg flex items-center gap-2 text-orange-900">
              <Info size={24} className="text-orange-500" />
              練馬区の補助金制度について
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-sm">
              <div className="bg-white p-5 rounded-2xl border border-orange-100 shadow-sm">
                <p className="font-bold text-orange-600 mb-2">国の補助金 (上限11,300円)</p>
                <p className="text-slate-600 leading-relaxed">
                  1日あたり450円を補助。利用日数が多ければ補助額が増えますが、月額11,300円が上限となります。
                </p>
              </div>
              <div className="bg-white p-5 rounded-2xl border border-orange-100 shadow-sm">
                <p className="font-bold text-orange-600 mb-2">練馬区の独自補助金 (合計15,000円まで)</p>
                <p className="text-slate-600 leading-relaxed">
                  利用料の総額が13,500円を超えた場合に、国の補助金(11,300円)と合算して最大15,000円まで補助されます。
                </p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-orange-200/50">
              <p className="text-xs text-slate-400 italic">※記載の補助内容は「保育の必要性の認定」等、諸条件を満たす場合の概算です。</p>
              <a 
                href="https://www.city.nerima.tokyo.jp/kosodate/yo_shien/yo_shien/azukari-shousai.html" 
                target="_blank" rel="noopener noreferrer"
                className="text-xs font-bold bg-orange-600 text-white px-6 py-2.5 rounded-full flex items-center gap-2 hover:bg-orange-700 transition-colors shadow-md shadow-orange-200"
              >
                練馬区の公式情報を確認する <ExternalLink size={14} />
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="max-w-4xl mx-auto px-4 py-12 text-center text-[10px] text-slate-400 space-y-4">
        <div className="flex justify-center gap-4">
          <span className="uppercase tracking-widest font-bold">Dandelion Class Fee Tool</span>
          <span className="opacity-20">|</span>
          <span className="uppercase tracking-widest">Nerima District, Tokyo</span>
        </div>
        <p className="max-w-md mx-auto text-slate-400 leading-relaxed">
          入力されたデータはお使いのブラウザ（ローカルストレージ）にのみ保存されます。サーバーには送信されないため、個人情報を登録することなく安全にご利用いただけます。
        </p>
        <p>© {new Date().getFullYear()} たんぽぽ組 保育料計算ツール. すべての計算結果は概算です。正確な情報は幼稚園または区の窓口にご確認ください。</p>
      </footer>
    </div>
  );
}

import { useState, useMemo, useEffect, useRef } from 'react';
import appIconUrl from 'container:///mnt/data/src/assets/3c29a363ce2c7846-image_20261118_185125.webp';
import {
  Trophy, ShieldCheck, Plus, Trash2, TrendingUp,
  Target, ChevronRight, ArrowRight, Star, AlertTriangle,
  BarChart3, Eye, Lock, Crown, Zap, Wallet, BookOpen, Mail, Calendar,
  Flame, BadgeCheck, Info, Settings2, X, Check, Pencil, Inbox, LogOut, EyeOff, MessageCircle,
  History, CheckCircle2, XCircle, Clock, Sparkles, Gem, Key, Unlock, UserCheck
} from 'lucide-react';

type TipType = 'Free' | 'VIP';
type TipResult = 'Pending' | 'Won' | 'Lost';
type Tip = { localId: string; recordId?: string | null; match: string; tip: string; odds?: string; date: string; kickoff: string; type: TipType; result: TipResult; };
type Inquiry = { id: string; name: string; email: string; message: string; createdAt: string; kind?: string; plan?: string; contact?: string; proofNote?: string; };
type VipCode = { localId: string; recordId?: string | null; code: string; createdAt: string; usedBy: string; status: 'Active' | 'Revoked'; plan: string; expiresAt: string; };
type VipPlan = 'VIP Monthly' | 'VIP Yearly' | 'Custom';
type CodeFilter = 'All' | 'Active' | 'Expiring Soon' | 'Expired';
type TabId = 'home' | 'free' | 'vip' | 'history' | 'contact' | 'admin';
const ADMIN_PASSWORD = 'wayne123';
function todayISO() { return new Date().toISOString().slice(0, 10); }
function addDaysISO(fromISO: string, days: number) { const d = new Date(fromISO); if (Number.isNaN(d.getTime())) return ''; d.setDate(d.getDate() + days); return d.toISOString(); }
function planDays(plan: VipPlan, customDays: number) { return plan === 'VIP Yearly' ? 365 : plan === 'Custom' ? Math.max(1, Math.min(3650, Math.floor(customDays) || 1)) : 30; }
function planLabel(plan: string) { if (plan === 'VIP Yearly') return 'VIP Yearly'; if (plan === 'Custom') return 'Custom'; return 'VIP Monthly'; }
function daysLeftFor(expiresAt: string) { if (!expiresAt) return null; const now = new Date(); const end = new Date(expiresAt); if (Number.isNaN(end.getTime())) return null; const diff = end.getTime() - now.getTime(); return Math.ceil(diff / (1000 * 60 * 60 * 24)); }
function expiryState(code: Pick<VipCode, 'status' | 'expiresAt'>) { if (code.status === 'Revoked') return 'Revoked' as const; const left = daysLeftFor(code.expiresAt); if (left === null) return 'Active' as const; if (left < 0) return 'Expired' as const; if (left <= 7) return 'Expiring Soon' as const; return 'Active' as const; }
function formatExpiry(iso: string) { if (!iso) return '—'; const d = new Date(iso); if (Number.isNaN(d.getTime())) return iso; return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }
function daysLeftText(expiresAt: string) { const left = daysLeftFor(expiresAt); if (left === null) return '—'; if (left < 0) return `Expired ${Math.abs(left)} day${Math.abs(left) === 1 ? '' : 's'} ago`; if (left === 0) return 'Expires today'; return `${left} day${left === 1 ? '' : 's'} left`; }
function formatDate(iso: string) { if (!iso) return ''; const d = new Date(iso + 'T12:00:00'); if (Number.isNaN(d.getTime())) return iso; return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }
function formatOdds(odds?: string | null) { if (!odds) return ''; const n = Number(String(odds).trim()); if (!Number.isFinite(n) || n <= 0) return ''; return `@ ${n.toFixed(2)}`; }
function formatKickoff(kickoff?: string | null) { if (!kickoff) return ''; const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(kickoff).trim()); return m ? `${m[1]}:${m[2]}` : String(kickoff).trim(); }
function kickoffSortValue(kickoff?: string | null) { const v = formatKickoff(kickoff); return v || '99:99'; }
function startOfWeek(d: Date) { const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate()); const day = (copy.getDay() + 6) % 7; copy.setDate(copy.getDate() - day); return copy; }
function inWeek(iso: string, weekOffset: number) { if (!iso) return false; const d = new Date(iso + 'T12:00:00'); if (Number.isNaN(d.getTime())) return false; const start = startOfWeek(new Date()); start.setDate(start.getDate() + weekOffset * 7); const end = new Date(start); end.setDate(end.getDate() + 7); return d >= start && d < end; }
function resultBadgeClass(result: TipResult) { if (result === 'Won') return 'bg-emerald-500/20 text-white border-emerald-400'; if (result === 'Lost') return 'bg-red-500/20 text-white border-red-400'; return 'bg-amber-500/20 text-white border-amber-400'; }
function makeVipCode() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 4; i++) suffix += chars[Math.floor(Math.random() * chars.length)];
  return `WAYNE-VIP-${suffix}`;
}

export default function App() {
  const [tips, setTips] = useState<Tip[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>('home');
  const [joinPlan, setJoinPlan] = useState<'VIP Monthly' | 'VIP Yearly' | null>(null);
  const [paymentMethod, setPaymentMethod] = useState('EcoCash');
  const [joinForm, setJoinForm] = useState({ name: '', contact: '', proofNote: '' });
  const [joinStatus, setJoinStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [historyFilter, setHistoryFilter] = useState<'All' | 'Today' | 'Yesterday' | 'Older' | 'Won' | 'Lost' | 'This Week' | 'Last Week'>('All');
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [resultBusy, setResultBusy] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);
  const [formData, setFormData] = useState({ match: '', tip: '', odds: '', date: todayISO(), kickoff: '', type: 'Free' as TipType, result: 'Pending' as TipResult });
  const [editingTip, setEditingTip] = useState<Tip | null>(null);
  const [adding, setAdding] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [inquiriesLoading, setInquiriesLoading] = useState(false);
  const [inquiriesError, setInquiriesError] = useState<string | null>(null);
  const [contactData, setContactData] = useState({ name: '', email: '', message: '' });
  const [formStatus, setFormStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [contactError, setContactError] = useState<string | null>(null);
  const [vipCodes, setVipCodes] = useState<VipCode[]>([]);
  const [vipCodesLoading, setVipCodesLoading] = useState(false);
  const [vipCodesError, setVipCodesError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'checking' | 'connected' | 'not-connected'>('checking');
  const [connectionMessage, setConnectionMessage] = useState<string | null>(null);
  const [testingConnection, setTestingConnection] = useState(false);
  const [vipCodeInput, setVipCodeInput] = useState('');
  const [vipUnlocking, setVipUnlocking] = useState(false);
  const [vipUnlockError, setVipUnlockError] = useState<string | null>(null);
  const [vipActive, setVipActive] = useState(false);
  const [activeVipCode, setActiveVipCode] = useState('');
  const [activeVipExpiresAt, setActiveVipExpiresAt] = useState('');
  const [activeVipPlan, setActiveVipPlan] = useState('');
  const [vipExpiredInfo, setVipExpiredInfo] = useState<{ code: string; expiresAt: string } | null>(null);
  const [generatePlan, setGeneratePlan] = useState<VipPlan>('VIP Monthly');
  const [customDays, setCustomDays] = useState(30);
  const [codeFilter, setCodeFilter] = useState<CodeFilter>('All');
  const [extendingId, setExtendingId] = useState<string | null>(null);
  const [deletingCodeId, setDeletingCodeId] = useState<string | null>(null);
  const [generatingCode, setGeneratingCode] = useState(false);
  const [lastGeneratedCode, setLastGeneratedCode] = useState('');
  const [lastGeneratedFor, setLastGeneratedFor] = useState('');
  const [manualCode, setManualCode] = useState('');
  const [manualUsedBy, setManualUsedBy] = useState('');
  const [manualBusy, setManualBusy] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [approvedCodes, setApprovedCodes] = useState<Record<string, string>>({});
  const [nowTick, setNowTick] = useState(Date.now());
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const keyClickTimes = useRef<number[]>([]);
  const keyResetTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const todayIso = new Date(nowTick).toISOString().slice(0, 10);
  const yesterdayIso = addDaysISO(todayIso, -1);
  function goTo(tab: TabId) { setActiveTab(tab); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  function handleKeyClick() {
    const now = Date.now();
    keyClickTimes.current = [...keyClickTimes.current.filter((t) => now - t <= 2000), now];
    const count = keyClickTimes.current.length;
    if (count >= 5) {
      keyClickTimes.current = [];
      if (keyResetTimeout.current) { clearTimeout(keyResetTimeout.current); keyResetTimeout.current = null; }
      goTo('admin');
      return;
    }
    if (keyResetTimeout.current) clearTimeout(keyResetTimeout.current);
    keyResetTimeout.current = setTimeout(() => { keyClickTimes.current = []; }, 2000);
  }

  async function reloadRecords() {
    const res = await fetch("actions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "records.list", args: { collection: "prime_tips", limit: 100 } }) });
    const j = await res.json(); if (!res.ok) throw new Error(j.error || 'Could not load tips');
    const records = j.data?.records || [];
    setTips(records.map((r: any) => ({ localId: `rec-${r.id}`, recordId: r.id, match: r.value.match || '', tip: r.value.tip || '', odds: r.value.odds ? String(r.value.odds) : '', date: r.value.date || '', kickoff: formatKickoff(r.value.kickoff || ''), type: r.value.type === 'VIP' ? 'VIP' as TipType : 'Free' as TipType, result: r.value.result === 'Won' ? 'Won' as TipResult : r.value.result === 'Lost' ? 'Lost' as TipResult : 'Pending' as TipResult })));
  }
  async function testConnection() {
    setTestingConnection(true); setConnectionStatus('checking'); setConnectionMessage(null);
    try {
      const res = await fetch("actions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "records.list", args: { collection: "prime_tips", limit: 1 } }) });
      const j = await res.json(); if (!res.ok || j.error) throw new Error(j.error || 'Connection test failed');
      setConnectionStatus('connected'); setConnectionMessage('Connected — tips, VIP codes and requests can be saved.');
    } catch (err: any) { setConnectionStatus('not-connected'); setConnectionMessage(err?.message || 'Failed — the records connection is not available right now.'); }
    finally { setTestingConnection(false); }
  }
  async function reloadInquiries() {
    setInquiriesLoading(true); setInquiriesError(null);
    try {
      const res = await fetch("actions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "records.list", args: { collection: "inquiries", limit: 100 } }) });
      const j = await res.json(); if (!res.ok) throw new Error(j.error || 'Could not load inquiries');
      const records = j.data?.records || [];
      setInquiries(records.map((r: any) => ({ id: r.id, name: r.value.name || '', email: r.value.email || '', message: r.value.message || '', createdAt: r.value.createdAt || r.created_at || '', kind: r.value.kind || '', plan: r.value.plan || '', contact: r.value.contact || '', proofNote: r.value.proofNote || '' })));
    } catch (err: any) { setInquiriesError(err?.message || 'Could not load inquiries.'); } finally { setInquiriesLoading(false); }
  }
  async function reloadVipCodes() {
    setVipCodesLoading(true); setVipCodesError(null);
    try {
      const res = await fetch("actions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "records.list", args: { collection: "vip_codes", limit: 100 } }) });
      const j = await res.json(); if (!res.ok) throw new Error(j.error || 'Could not load VIP codes');
      const records = j.data?.records || [];
      setVipCodes(records.map((r: any) => { const createdAt = r.value.createdAt || r.created_at || ''; return { localId: `vip-${r.id}`, recordId: r.id, code: String(r.value.code || '').toUpperCase(), createdAt, usedBy: r.value.usedBy || '', status: r.value.status === 'Revoked' ? 'Revoked' as const : 'Active' as const, plan: r.value.plan || 'VIP Monthly', expiresAt: r.value.expiresAt || (createdAt ? addDaysISO(createdAt, 30) : '') }; }));
    } catch (err: any) { setVipCodesError(err?.message || 'Could not load VIP codes.'); } finally { setVipCodesLoading(false); }
  }
  async function createVipCodeRecord(code: string, usedBy: string, plan: string = 'VIP Monthly', expiresAt?: string) {
    const createdAt = new Date().toISOString();
    const days = plan === 'VIP Yearly' ? 365 : plan === 'Custom' ? planDays('Custom', customDays) : 30;
    const value = { code: code.toUpperCase(), createdAt, usedBy: usedBy.trim(), status: 'Active', plan: planLabel(plan), expiresAt: expiresAt || addDaysISO(createdAt, days) };
    const res = await fetch("actions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "records.create", args: { collection: "vip_codes", value, idempotency_key: `vipcode-${code.toLowerCase()}-${Date.now()}` } }) });
    const j = await res.json(); if (!res.ok) throw new Error(j.error || 'Could not save VIP code');
    return j.data;
  }
  async function handleGenerateCode() {
    setGeneratingCode(true); setVipCodesError(null);
    try {
      let code = makeVipCode();
      let attempts = 0;
      while (vipCodes.some(c => c.code === code) && attempts < 5) { code = makeVipCode(); attempts++; }
      const days = planDays(generatePlan, customDays);
      const createdAt = new Date().toISOString();
      await createVipCodeRecord(code, '', generatePlan, addDaysISO(createdAt, days));
      setLastGeneratedCode(code); setLastGeneratedFor('');
      await reloadVipCodes();
      setNotice(`New VIP code generated: ${code} (${generatePlan}, expires on ${formatExpiry(addDaysISO(createdAt, days))}) — send it to the payer.`);
    } catch (err: any) { setVipCodesError(err?.message || 'Could not generate a VIP code.'); } finally { setGeneratingCode(false); }
  }
  async function handleManualAdd(e: React.FormEvent) {
    e.preventDefault();
    const code = manualCode.trim().toUpperCase();
    if (!code) { setManualError('Enter a code to add.'); return; }
    if (vipCodes.some(c => c.code === code)) { setManualError('That code already exists.'); return; }
    setManualBusy(true); setManualError(null);
    try {
      const days = planDays(generatePlan, customDays);
      await createVipCodeRecord(code, manualUsedBy, generatePlan, addDaysISO(new Date().toISOString(), days));
      setLastGeneratedCode(code); setLastGeneratedFor(manualUsedBy);
      setManualCode(''); setManualUsedBy('');
      await reloadVipCodes();
      setNotice(`VIP code ${code} added manually.`);
    } catch (err: any) { setManualError(err?.message || 'Could not add this code.'); } finally { setManualBusy(false); }
  }
  async function handleRevoke(codeRec: VipCode) {
    if (!codeRec.recordId || revokingId) return;
    setRevokingId(codeRec.localId); setVipCodesError(null);
    try {
      const value = { code: codeRec.code, createdAt: codeRec.createdAt, usedBy: codeRec.usedBy, status: 'Revoked', plan: codeRec.plan, expiresAt: codeRec.expiresAt };
      const res = await fetch("actions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "records.replace", args: { collection: "vip_codes", id: codeRec.recordId, value } }) });
      const j = await res.json(); if (!res.ok) throw new Error(j.error || 'Revoke failed');
      setVipCodes(prev => prev.map(c => c.localId === codeRec.localId ? { ...c, status: 'Revoked' as const } : c));
      if (activeVipCode === codeRec.code) { setVipActive(false); setActiveVipCode(''); setActiveVipExpiresAt(''); setActiveVipPlan(''); }
      setNotice(`VIP code ${codeRec.code} revoked — it no longer unlocks VIP tips.`);
    } catch (err: any) { setVipCodesError(err?.message || 'Could not revoke this code.'); } finally { setRevokingId(null); }
  }
  async function handleApproveRequest(q: Inquiry) {
    if (approvingId) return;
    setApprovingId(q.id); setVipCodesError(null);
    try {
      const usedBy = [q.name, q.contact || q.email].filter(Boolean).join(' — ');
      let code = makeVipCode();
      let attempts = 0;
      while (vipCodes.some(c => c.code === code) && attempts < 5) { code = makeVipCode(); attempts++; }
      const plan = (q.plan || '').toLowerCase().includes('yearly') ? 'VIP Yearly' : 'VIP Monthly';
      const days = plan === 'VIP Yearly' ? 365 : 30;
      await createVipCodeRecord(code, usedBy, plan, addDaysISO(new Date().toISOString(), days));
      setApprovedCodes(prev => ({ ...prev, [q.id]: code }));
      setLastGeneratedCode(code); setLastGeneratedFor(usedBy);
      await reloadVipCodes();
      setNotice(`Approved ${q.name || 'request'} — VIP code ${code} generated (${plan}, expires on ${formatExpiry(addDaysISO(new Date().toISOString(), days))}). Copy it and send it to them.`);
    } catch (err: any) { setVipCodesError(err?.message || 'Could not approve this request.'); } finally { setApprovingId(null); }
  }
  async function handleUnlockVip(e: React.FormEvent) {
    e.preventDefault();
    const entered = vipCodeInput.trim().toUpperCase();
    if (!entered) { setVipUnlockError('Enter your VIP code.'); return; }
    setVipUnlocking(true); setVipUnlockError(null);
    try {
      const res = await fetch("actions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "records.list", args: { collection: "vip_codes", limit: 100 } }) });
      const j = await res.json(); if (!res.ok) throw new Error(j.error || 'Could not check VIP code');
      const records = j.data?.records || [];
      const found = records.map((r: any) => { const createdAt = r.value.createdAt || r.created_at || ''; return { code: String(r.value.code || '').toUpperCase(), status: r.value.status === 'Revoked' ? 'Revoked' : 'Active', usedBy: r.value.usedBy || '', plan: r.value.plan || 'VIP Monthly', expiresAt: r.value.expiresAt || (createdAt ? addDaysISO(createdAt, 30) : '') }; }).find((c: any) => c.code === entered);
      if (!found) { setVipUnlockError('That code was not found. Check the code Wayne sent you, or request VIP access below.'); return; }
      if (found.status === 'Revoked') { setVipUnlockError('This VIP code has been revoked. WhatsApp Wayne for a new code.'); return; }
      const left = daysLeftFor(found.expiresAt);
      if (left !== null && left < 0) { setVipExpiredInfo({ code: entered, expiresAt: found.expiresAt }); setVipUnlockError(`This code has expired on ${formatExpiry(found.expiresAt)}. Please renew VIP.`); return; }
      setVipExpiredInfo(null);
      setVipActive(true); setActiveVipCode(entered); setActiveVipExpiresAt(found.expiresAt); setActiveVipPlan(found.plan);
      setNotice(`VIP unlocked — welcome to the Inner Circle. Expires on ${formatExpiry(found.expiresAt)} — ${left === null ? '' : `${left} day${left === 1 ? '' : 's'} left`}.`);
      setVipCodes(records.map((r: any) => { const createdAt = r.value.createdAt || r.created_at || ''; return { localId: `vip-${r.id}`, recordId: r.id, code: String(r.value.code || '').toUpperCase(), createdAt, usedBy: r.value.usedBy || '', status: r.value.status === 'Revoked' ? 'Revoked' as const : 'Active' as const, plan: r.value.plan || 'VIP Monthly', expiresAt: r.value.expiresAt || (createdAt ? addDaysISO(createdAt, 30) : '') }; }));
    } catch (err: any) { setVipUnlockError(err?.message || 'Could not check your code. Please try again.'); } finally { setVipUnlocking(false); }
  }
  function handleLockVip() { setVipActive(false); setActiveVipCode(''); setActiveVipExpiresAt(''); setActiveVipPlan(''); setVipExpiredInfo(null); setVipCodeInput(''); setVipUnlockError(null); setNotice('VIP locked. Enter your code again to unlock.'); }
  async function handleExtendCode(codeRec: VipCode) {
    if (!codeRec.recordId || extendingId) return;
    setExtendingId(codeRec.localId); setVipCodesError(null);
    try {
      const base = daysLeftFor(codeRec.expiresAt) !== null && (daysLeftFor(codeRec.expiresAt) || 0) >= 0 ? codeRec.expiresAt : new Date().toISOString();
      const expiresAt = addDaysISO(base, 30);
      const value = { code: codeRec.code, createdAt: codeRec.createdAt, usedBy: codeRec.usedBy, status: codeRec.status, plan: codeRec.plan, expiresAt };
      const res = await fetch("actions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "records.replace", args: { collection: "vip_codes", id: codeRec.recordId, value } }) });
      const j = await res.json(); if (!res.ok) throw new Error(j.error || 'Extend failed');
      setVipCodes(prev => prev.map(c => c.localId === codeRec.localId ? { ...c, expiresAt } : c));
      if (activeVipCode === codeRec.code) setActiveVipExpiresAt(expiresAt);
      setNotice(`VIP code ${codeRec.code} extended by 30 days — now expires on ${formatExpiry(expiresAt)}.`);
    } catch (err: any) { setVipCodesError(err?.message || 'Could not extend this code.'); } finally { setExtendingId(null); }
  }
  async function handleDeleteCode(codeRec: VipCode) {
    if (!codeRec.recordId || deletingCodeId) return;
    setDeletingCodeId(codeRec.localId); setVipCodesError(null);
    try {
      const res = await fetch("actions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "records.delete", args: { collection: "vip_codes", id: codeRec.recordId } }) });
      const j = await res.json(); if (!res.ok) throw new Error(j.error || 'Delete failed');
      setVipCodes(prev => prev.filter(c => c.localId !== codeRec.localId));
      if (activeVipCode === codeRec.code) { setVipActive(false); setActiveVipCode(''); setActiveVipExpiresAt(''); setActiveVipPlan(''); }
      setNotice(`VIP code ${codeRec.code} deleted.`);
    } catch (err: any) { setVipCodesError(err?.message || 'Could not delete this code.'); } finally { setDeletingCodeId(null); }
  }

  useEffect(() => { document.title = 'Wayne Betting Tips'; }, []);
  useEffect(() => { const t = setInterval(() => setNowTick(Date.now()), 30000); return () => clearInterval(t); }, []);
  useEffect(() => {
    const upsertMeta = (selector: string, create: () => HTMLMetaElement) => {
      let el = document.head.querySelector(selector) as HTMLMetaElement | null;
      if (!el) { el = create(); document.head.appendChild(el); }
      return el;
    };
    upsertMeta('meta[name="application-name"]', () => { const m = document.createElement('meta'); m.setAttribute('name', 'application-name'); return m; }).setAttribute('content', 'Wayne Betting Tips');
    upsertMeta('meta[name="apple-mobile-web-app-title"]', () => { const m = document.createElement('meta'); m.setAttribute('name', 'apple-mobile-web-app-title'); return m; }).setAttribute('content', 'Wayne Tips');
    upsertMeta('meta[name="theme-color"]', () => { const m = document.createElement('meta'); m.setAttribute('name', 'theme-color'); return m; }).setAttribute('content', '#0A0F0D');
    upsertMeta('meta[name="description"]', () => { const m = document.createElement('meta'); m.setAttribute('name', 'description'); return m; }).setAttribute('content', 'Premium Betting Tips - Wayne Betting Tips');
    upsertMeta('meta[name="mobile-web-app-capable"]', () => { const m = document.createElement('meta'); m.setAttribute('name', 'mobile-web-app-capable'); return m; }).setAttribute('content', 'yes');
    upsertMeta('meta[name="apple-mobile-web-app-capable"]', () => { const m = document.createElement('meta'); m.setAttribute('name', 'apple-mobile-web-app-capable'); return m; }).setAttribute('content', 'yes');
    upsertMeta('meta[name="apple-mobile-web-app-status-bar-style"]', () => { const m = document.createElement('meta'); m.setAttribute('name', 'apple-mobile-web-app-status-bar-style'); return m; }).setAttribute('content', 'black-translucent');
    const manifest = { name: 'Wayne Betting Tips', short_name: 'Wayne Tips', description: 'Premium Betting Tips - Wayne Betting Tips', start_url: '.', display: 'standalone', orientation: 'portrait', theme_color: '#0A0F0D', background_color: '#0A0F0D', icons: [{ src: appIconUrl, sizes: '192x192', type: 'image/webp', purpose: 'any' }, { src: appIconUrl, sizes: '512x512', type: 'image/webp', purpose: 'any' }, { src: appIconUrl, sizes: '192x192', type: 'image/webp', purpose: 'maskable' }, { src: appIconUrl, sizes: '512x512', type: 'image/webp', purpose: 'maskable' }] };
    let manifestUrl = '';
    try {
      const blob = new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' });
      manifestUrl = URL.createObjectURL(blob);
      let link = document.head.querySelector('link[rel="manifest"]') as HTMLLinkElement | null;
      if (!link) { link = document.createElement('link'); link.rel = 'manifest'; document.head.appendChild(link); }
      link.href = manifestUrl;
    } catch { /* PWA manifest is progressive enhancement */ }
    const setIconLink = (rel: string, sizes?: string) => {
      let link = document.head.querySelector(`link[rel="${rel}"]${sizes ? `[sizes="${sizes}"]` : ''}`) as HTMLLinkElement | null;
      if (!link) { link = document.createElement('link'); link.rel = rel; if (sizes) link.setAttribute('sizes', sizes); document.head.appendChild(link); }
      link.href = appIconUrl; link.type = 'image/webp';
    };
    setIconLink('icon'); setIconLink('apple-touch-icon'); setIconLink('apple-touch-icon', '180x180');
    let swUrl = '';
    try {
      if ('serviceWorker' in navigator) {
        const swCode = `const CACHE='wayne-tips-shell-v1'; const CORE=['./']; self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).catch(() => undefined).then(() => self.skipWaiting())); }); self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); }); self.addEventListener('fetch', (e) => { if (e.request.method !== 'GET') return; e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => { const copy = res.clone(); if (res.ok && new URL(e.request.url).origin === self.location.origin) caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => undefined); return res; }).catch(() => caches.match('./')))); });`;
        swUrl = URL.createObjectURL(new Blob([swCode], { type: 'text/javascript' }));
        navigator.serviceWorker.register(swUrl, { scope: './' }).catch(() => { /* offline support is optional in preview */ });
      }
    } catch { /* service workers are progressive enhancement */ }
    return () => { if (manifestUrl) URL.revokeObjectURL(manifestUrl); if (swUrl) URL.revokeObjectURL(swUrl); };
  }, []);
  useEffect(() => { (async () => { try { await reloadRecords(); } catch { } finally { setLoading(false); } })(); }, []);
  useEffect(() => { if (isAdmin) { testConnection(); } }, [isAdmin]);
  useEffect(() => {
    if (!vipActive || !activeVipExpiresAt) return;
    const left = daysLeftFor(activeVipExpiresAt);
    if (left !== null && left < 0) { setVipActive(false); setVipExpiredInfo({ code: activeVipCode, expiresAt: activeVipExpiresAt }); setNotice(`Your VIP code expired on ${formatExpiry(activeVipExpiresAt)}. VIP Tips are locked again — please renew.`); return; }
    const t = setInterval(() => { const l = daysLeftFor(activeVipExpiresAt); if (l !== null && l < 0) { setVipActive(false); setVipExpiredInfo({ code: activeVipCode, expiresAt: activeVipExpiresAt }); setNotice(`Your VIP code expired on ${formatExpiry(activeVipExpiresAt)}. VIP Tips are locked again — please renew.`); } }, 30000);
    return () => clearInterval(t);
  }, [vipActive, activeVipExpiresAt, activeVipCode]);

  const settledTips = useMemo(() => tips.filter(t => t.result === 'Won' || t.result === 'Lost'), [tips]);
  const pendingPastTips = useMemo(() => tips.filter(t => t.result === 'Pending' && !!t.date && t.date < todayIso).sort((a, b) => (b.date || '').localeCompare(a.date || '') || kickoffSortValue(a.kickoff).localeCompare(kickoffSortValue(b.kickoff)) || b.localId.localeCompare(a.localId)), [tips, todayIso]);
  const freeTips = useMemo(() => tips.filter(t => t.type === 'Free' && t.result === 'Pending' && t.date === todayIso).sort((a, b) => kickoffSortValue(a.kickoff).localeCompare(kickoffSortValue(b.kickoff)) || a.match.localeCompare(b.match)), [tips, todayIso]);
  const vipPendingTips = useMemo(() => tips.filter(t => t.type === 'VIP' && t.result === 'Pending' && t.date === todayIso).sort((a, b) => kickoffSortValue(a.kickoff).localeCompare(kickoffSortValue(b.kickoff)) || a.match.localeCompare(b.match)), [tips, todayIso]);
  const vipTips = useMemo(() => tips.filter(t => t.type === 'VIP'), [tips]);
  const historyTips = useMemo(() => [...settledTips, ...pendingPastTips].sort((a, b) => (b.date || '').localeCompare(a.date || '') || kickoffSortValue(a.kickoff).localeCompare(kickoffSortValue(b.kickoff)) || b.localId.localeCompare(a.localId)), [settledTips, pendingPastTips]);
  const historyStats = useMemo(() => { const total = settledTips.length; const won = settledTips.filter(t => t.result === 'Won').length; const lost = settledTips.filter(t => t.result === 'Lost').length; const winRate = total > 0 ? (won / total) * 100 : 0; return { total, won, lost, winRate }; }, [settledTips]);
  const filteredHistory = useMemo(() => {
    if (historyFilter === 'Won') return historyTips.filter(t => t.result === 'Won');
    if (historyFilter === 'Lost') return historyTips.filter(t => t.result === 'Lost');
    if (historyFilter === 'Today') return historyTips.filter(t => t.date === todayIso);
    if (historyFilter === 'Yesterday') return historyTips.filter(t => t.date === yesterdayIso);
    if (historyFilter === 'Older') return historyTips.filter(t => !!t.date && t.date < yesterdayIso);
    if (historyFilter === 'This Week') return historyTips.filter(t => inWeek(t.date, 0));
    if (historyFilter === 'Last Week') return historyTips.filter(t => inWeek(t.date, -1));
    return historyTips;
  }, [historyTips, historyFilter, todayIso, yesterdayIso]);
  const vipJoinRequests = useMemo(() => inquiries.filter(q => q.kind === 'vip_join').sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')), [inquiries]);
  const sortedVipCodes = useMemo(() => [...vipCodes].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')), [vipCodes]);
  const filteredVipCodes = useMemo(() => codeFilter === 'All' ? sortedVipCodes : sortedVipCodes.filter(c => expiryState(c) === codeFilter), [sortedVipCodes, codeFilter]);
  const codeCounts = useMemo(() => ({ All: sortedVipCodes.length, Active: sortedVipCodes.filter(c => expiryState(c) === 'Active').length, 'Expiring Soon': sortedVipCodes.filter(c => expiryState(c) === 'Expiring Soon').length, Expired: sortedVipCodes.filter(c => expiryState(c) === 'Expired').length }), [sortedVipCodes]);
  const activeDaysLeft = vipActive ? daysLeftFor(activeVipExpiresAt) : null;
  const activeCodeRecord = vipCodes.find(c => c.code === activeVipCode);
  const activeTotalDays = activeCodeRecord && activeCodeRecord.createdAt && activeCodeRecord.expiresAt ? Math.max(1, Math.round((new Date(activeCodeRecord.expiresAt).getTime() - new Date(activeCodeRecord.createdAt).getTime()) / (1000 * 60 * 60 * 24))) : activeVipPlan === 'VIP Yearly' ? 365 : 30;
  const activeProgress = activeDaysLeft === null ? 100 : Math.max(0, Math.min(100, (activeDaysLeft / activeTotalDays) * 100));
  const activeExpiringSoon = activeDaysLeft !== null && activeDaysLeft >= 0 && activeDaysLeft <= 3;
  const ringC = 2 * Math.PI * 62;

  function handleLogin(e: React.FormEvent) {
    e.preventDefault(); setLoggingIn(true); setLoginError(null);
    setTimeout(() => { if (password === ADMIN_PASSWORD) { setIsAdmin(true); setPassword(''); setNotice('Welcome back, Admin. You are now in the Admin window.'); setActiveTab('admin'); reloadInquiries(); reloadVipCodes(); } else { setLoginError('Incorrect admin password. Please try again.'); } setLoggingIn(false); }, 180);
  }
  function handleLogout() { setIsAdmin(false); setEditingTip(null); setFormData({ match: '', tip: '', odds: '', date: todayISO(), kickoff: '', type: 'Free', result: 'Pending' }); setNotice('Logged out. You are now viewing the public windows.'); setActiveTab('home'); window.scrollTo({ top: 0 }); }
  async function handleSaveTip(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.match.trim() || !formData.tip.trim() || !formData.date || !formData.kickoff) { setFormError('Please fill Match, Tip, Date and Kick-Off Time.'); return; }
    if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(formData.kickoff)) { setFormError('Kick-Off Time must be a valid time, e.g. 15:00.'); return; }
    const oddsTrimmed = formData.odds.trim();
    if (oddsTrimmed && (!Number.isFinite(Number(oddsTrimmed)) || Number(oddsTrimmed) <= 0)) { setFormError('Odds must be a number greater than 0, e.g. 1.85.'); return; }
    setAdding(true); setFormError(null); setNotice(null);
    const value = { match: formData.match.trim(), tip: formData.tip.trim(), odds: oddsTrimmed ? Number(oddsTrimmed).toFixed(2) : '', date: formData.date, kickoff: formData.kickoff, type: formData.type, result: formData.result };
    try {
      if (editingTip) {
        if (editingTip.recordId) { const res = await fetch("actions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "records.replace", args: { collection: "prime_tips", id: editingTip.recordId, value } }) }); const j = await res.json(); if (!res.ok) throw new Error(j.error || 'Update failed'); }
        setTips(prev => prev.map(t => t.localId === editingTip.localId ? { ...t, ...value } : t));
        setNotice(value.result === 'Pending' ? `Tip updated — “${value.match}” is now live.` : `Tip updated — “${value.match}” moved to History as ${value.result}.`);
      } else {
        const idempotency_key = `tip-${Date.now()}-${formData.match.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
        const res = await fetch("actions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "records.create", args: { collection: "prime_tips", value, idempotency_key } }) });
        const j = await res.json(); if (!res.ok) throw new Error(j.error || 'Save failed');
        const created: Tip = { localId: `rec-${j.data.id}`, recordId: j.data.id, ...value }; setTips(prev => [...prev, created]);
        setNotice(value.result === 'Pending' ? `${value.type} tip added — it is now live for visitors.` : `${value.type} tip added to History as ${value.result}.`);
      }
      setEditingTip(null); setFormData({ match: '', tip: '', odds: '', date: todayISO(), kickoff: '', type: formData.type, result: 'Pending' });
    } catch (err: any) {
      setFormError(`Tip was not saved: ${err?.message || 'Save failed'} — please try again. Your entry is still in the form so you can retry.`);
    } finally { setAdding(false); }
  }
  function startEdit(tip: Tip) { setEditingTip(tip); setFormData({ match: tip.match, tip: tip.tip, odds: tip.odds || '', date: tip.date || todayISO(), kickoff: tip.kickoff || '', type: tip.type, result: tip.result }); setFormError(null); setNotice(null); setActiveTab('admin'); window.scrollTo({ top: 0 }); }
  function cancelEdit() { setEditingTip(null); setFormData({ match: '', tip: '', odds: '', date: todayISO(), kickoff: '', type: 'Free', result: 'Pending' }); setFormError(null); }
  async function updateTipResult(tip: Tip, result: TipResult) {
    if (tip.result === result || resultBusy) return; setResultBusy(tip.localId); setHistoryError(null); setNotice(null);
    const value = { match: tip.match, tip: tip.tip, odds: tip.odds || '', date: tip.date, kickoff: tip.kickoff || '', type: tip.type, result };
    try {
      if (tip.recordId) { const res = await fetch("actions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "records.replace", args: { collection: "prime_tips", id: tip.recordId, value } }) }); const j = await res.json(); if (!res.ok) throw new Error(j.error || 'Update failed'); }
      setTips(prev => prev.map(t => t.localId === tip.localId ? { ...t, result } : t));
      setNotice(result === 'Pending' ? `“${tip.match}” moved back to current tips as Pending.` : `“${tip.match}” marked ${result} — moved to History. Win Rate updated.`);
    } catch (err: any) { setHistoryError(`Result was not saved: ${err?.message || 'Update failed'} — please try again.`); } finally { setResultBusy(null); }
  }
  async function deleteTip(tip: Tip) {
    setNotice(null); setFormError(null); setHistoryError(null);
    if (tip.recordId) {
      try { const res = await fetch("actions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "records.delete", args: { collection: "prime_tips", id: tip.recordId } }) }); const j = await res.json(); if (!res.ok) throw new Error(j.error || 'Delete failed'); }
      catch (err: any) { setHistoryError(`Tip was not deleted: ${err?.message || 'Delete failed'} — please try again.`); return; }
    }
    if (editingTip?.localId === tip.localId) cancelEdit(); setTips(prev => prev.filter(t => t.localId !== tip.localId)); setNotice('Tip deleted.');
  }
  async function handleContact(e: React.FormEvent) {
    e.preventDefault(); if (!contactData.name || !contactData.email || !contactData.message) { setContactError('Please fill name, email and message.'); return; }
    setFormStatus('sending'); setContactError(null);
    try { const res = await fetch("actions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "records.create", args: { collection: "inquiries", value: { ...contactData, createdAt: new Date().toISOString() }, idempotency_key: `${contactData.email}-${Date.now()}` } }) }); const j = await res.json(); if (!res.ok) throw new Error(j.error || 'Failed to send'); setFormStatus('sent'); setContactData({ name: '', email: '', message: '' }); setTimeout(() => setFormStatus('idle'), 4000); }
    catch (err: any) { setFormStatus('error'); setContactError(err.message || 'Something went wrong.'); }
  }
  function openJoin(plan: 'VIP Monthly' | 'VIP Yearly') { setJoinPlan(plan); setPaymentMethod('EcoCash'); setJoinForm({ name: '', contact: '', proofNote: '' }); setJoinStatus('idle'); setJoinError(null); }
  function closeJoin() { setJoinPlan(null); setJoinStatus('idle'); setJoinError(null); }
  async function handleJoinSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!joinPlan) return;
    if (!joinForm.name.trim() || !joinForm.contact.trim()) { setJoinError('Please add your name and phone or email.'); return; }
    setJoinStatus('sending'); setJoinError(null);
    const planLabelText = joinPlan === 'VIP Monthly' ? 'VIP Monthly - $19/mo' : 'VIP Yearly - $149/yr';
    const value = { name: joinForm.name.trim(), email: joinForm.contact.includes('@') ? joinForm.contact.trim() : '', contact: joinForm.contact.trim(), proofNote: joinForm.proofNote.trim(), message: `VIP join request — ${planLabelText}. Payment method: ${paymentMethod}. Contact: ${joinForm.contact.trim()}. Proof note: ${joinForm.proofNote.trim() || 'Not provided yet.'}`, createdAt: new Date().toISOString(), kind: 'vip_join', plan: planLabelText };
    try {
      const res = await fetch("actions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "records.create", args: { collection: "inquiries", value, idempotency_key: `vip-${joinPlan}-${Date.now()}-${joinForm.contact.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}` } }) });
      const j = await res.json(); if (!res.ok) throw new Error(j.error || 'Request failed');
      setJoinStatus('sent'); setNotice(`VIP request received — ${planLabelText}. Wayne will contact you from tadiwagombakomba35@gmail.com`);
      if (isAdmin) { try { await reloadInquiries(); } catch { /* admin list refresh is optional */ } }
    } catch (err: any) { setJoinStatus('error'); setJoinError(err?.message || 'Could not send your request. Please try again or email Wayne directly.'); }
  }

  const filterButtons: Array<'All' | 'Today' | 'Yesterday' | 'Older' | 'Won' | 'Lost' | 'This Week' | 'Last Week'> = ['All', 'Today', 'Yesterday', 'Older', 'Won', 'Lost', 'This Week', 'Last Week'];
  const tabs: Array<{ id: TabId; label: string }> = [{ id: 'home', label: 'Home' }, { id: 'free', label: 'Free Tips' }, { id: 'vip', label: 'VIP Tips' }, { id: 'history', label: 'History' }, { id: 'contact', label: 'Contact' }];
  const eyebrow = "text-sm tracking-wide font-bold text-[#FFE9A8] uppercase flex flex-wrap items-center gap-2 leading-relaxed break-words";
  const btnBase = "inline-flex items-center justify-center gap-2 text-center text-sm font-bold px-4 py-3 rounded-full break-words leading-relaxed";

  // Shared tip row — all fields wrap, nothing clipped
  const renderTipRow = (t: Tip, i: number) => (
    <li key={t.localId} className="px-4 sm:px-6 py-5 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
      <span className="hidden sm:flex w-9 h-9 shrink-0 rounded-full border border-[var(--border)] bg-black/30 items-center justify-center text-sm font-bold text-[#FFE9A8]">{String(i + 1).padStart(2, '0')}</span>
      <div className="flex-1 min-w-0 leading-relaxed break-words">
        <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-white"><Clock size={16} className="shrink-0 text-[#FFE9A8]" /><span className="break-words">Kick-Off: {formatKickoff(t.kickoff) || '—'}</span>{t.date ? <span className="text-sm text-white">{formatDate(t.date)}</span> : null}</p>
        <p className="mt-2 text-base font-bold text-white leading-relaxed break-words">Match: {t.match}</p>
        <p className="mt-1 text-base font-bold text-[#FFE9A8] leading-relaxed break-words">Tip: {t.tip}</p>
        {formatOdds(t.odds) ? <p className="mt-2"><span className="inline-flex flex-wrap items-center px-4 py-2 rounded-full bg-emerald-500/25 border border-emerald-400 text-white text-base font-bold break-words">Odds {formatOdds(t.odds)}</span></p> : null}
      </div>
      <ChevronRight size={18} className="text-[#FFE9A8] shrink-0 hidden sm:block" />
    </li>
  );

  return (
    <div data-safe-area-inset-root className="min-h-screen bg-[var(--bg)] text-white overflow-x-clip relative noise" style={{ boxSizing: 'border-box', paddingTop: 'var(--safe-area-inset-top)' }}>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[620px] z-0" style={{ background: 'radial-gradient(58% 55% at 78% 2%, rgba(212,175,106,0.16) 0%, transparent 62%), radial-gradient(48% 50% at 8% 18%, rgba(31,170,82,0.18) 0%, transparent 60%), radial-gradient(38% 38% at 50% 38%, rgba(212,175,106,0.07) 0%, transparent 70%)' }} />

      <div className="relative z-10 border-b border-white/5 overflow-visible">
        <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 py-3 flex flex-wrap items-center justify-between gap-3 overflow-visible">
          <button onClick={() => goTo('home')} className="flex items-center gap-3 min-w-0 text-left overflow-visible shrink-0 pr-3">
            <span className="w-10 h-10 rounded-full border-2 border-[#D4AF6A] overflow-hidden flex items-center justify-center shrink-0 bg-[#0A0F0D]"><img src={appIconUrl} alt="Wayne Betting Tips app icon" className="w-full h-full object-cover" /></span>
            <span className="logo-lockup leading-[1.1] break-words">
              <span className="logo-line font-black text-[15px] sm:text-lg text-white">WAYNE</span>
              <span className="logo-line font-black text-[15px] sm:text-lg"><span className="gold-text">BETTING TIPS</span></span>
              <span className="hidden sm:block text-sm tracking-wide text-white uppercase mt-1 pr-3">Est. Precision • Verified • Daily</span>
            </span>
          </button>
          <div className="hidden md:flex items-center gap-2 text-sm text-white break-words"><Calendar size={16} className="text-[#FFE9A8] shrink-0" />{today}</div>
          <div className="flex flex-wrap items-center gap-2">
            {vipActive && <span className="inline-flex flex-wrap items-center gap-1.5 px-4 py-3 rounded-full bg-emerald-500/20 border border-emerald-400 text-white text-sm font-bold break-words"><CheckCircle2 size={16} /> VIP Active</span>}
            {isAdmin ? (<><button onClick={() => goTo('admin')} className={`btn-gold ${btnBase}`}><Settings2 size={16} /> Admin</button><button onClick={handleLogout} className={`${btnBase} bg-white/5 border border-white/10`}><LogOut size={16} /> Logout</button></>)
            : (<button onClick={() => goTo('vip')} className={`btn-gold shine ${btnBase}`}><Crown size={16} /> Join VIP</button>)}
          </div>
        </div>
      </div>

      <header data-safe-area-sticky-top className="sticky z-40 bg-[#0A0F0D]/90 backdrop-blur-xl border-b border-white/5" style={{ top: 'var(--safe-area-inset-top)' }}>
        <nav className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 py-2 flex items-center gap-2 overflow-x-auto no-scrollbar text-sm font-semibold" aria-label="Main windows">
          {tabs.map((n) => { const active = activeTab === n.id; return (<button key={n.id} onClick={() => goTo(n.id)} aria-current={active ? 'page' : undefined} aria-pressed={active} className={`relative px-4 py-3 rounded-full flex items-center gap-1.5 shrink-0 text-sm font-bold break-words leading-relaxed ${active ? 'text-[#171203]' : 'text-white hover:text-white hover:bg-white/5'}`}>{active && <span className="absolute inset-0 rounded-full bg-gradient-to-r from-[#FFF0B8] via-[#E6C87A] to-[#C9A24B]" /> }<span className="relative flex flex-wrap items-center gap-1.5">{n.label}{n.id === 'vip' && vipActive && <span className="w-2 h-2 rounded-full bg-emerald-400" />}</span></button>); })}
          <span className="ml-auto hidden lg:inline-flex flex-wrap items-center gap-2 text-sm tracking-wide text-white font-bold shrink-0 break-words"><span className="w-2 h-2 rounded-full bg-emerald-400" style={{ animation: 'pulseDot 1.6s infinite' }} /> {activeTab.toUpperCase()} WINDOW</span>
        </nav>
      </header>

      <main className="relative z-10">
        {notice && (<div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 pt-6"><div className="glass rounded-2xl px-4 py-4 text-sm leading-relaxed flex flex-wrap items-center gap-3 break-words"><span className="text-white"><Check size={16} className="inline mr-1" /></span><span className="flex-1 min-w-0 break-words text-white">{notice}</span><button onClick={() => setNotice(null)} className="underline underline-offset-2 text-white text-sm font-bold px-2 py-2">Dismiss</button></div></div>)}

        {activeTab === 'home' && (
          <section className="relative">
            <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 pt-10 sm:pt-[68px] pb-14">
              <div className="max-w-[980px]">
                <div className="flex flex-wrap items-center gap-2 mb-6 animate-fadeUp">
                  <span className="inline-flex flex-wrap items-center gap-2 bg-emerald-500/20 text-white border border-emerald-400 rounded-full px-4 py-3 text-sm font-bold tracking-wide break-words"><span className="w-2 h-2 rounded-full bg-emerald-400" style={{ animation: 'pulseDot 1.6s infinite' }} /> LIVE TODAY</span>
                  <span className="inline-flex flex-wrap items-center gap-1.5 bg-white/5 border border-[var(--border)] rounded-full px-4 py-3 text-sm font-semibold text-white break-words"><ShieldCheck size={16} className="text-[#FFE9A8]" /> 18+ • Play responsibly</span>
                  {vipActive && <span className="inline-flex flex-wrap items-center gap-1.5 bg-emerald-500 text-black rounded-full px-4 py-3 text-sm font-bold break-words"><CheckCircle2 size={16} /> VIP ACTIVE</span>}
                  {isAdmin && <span className="inline-flex flex-wrap items-center gap-1.5 bg-[#FFE9A8] text-[#0A0F0D] rounded-full px-4 py-3 text-sm font-bold break-words"><Settings2 size={16} /> ADMIN VIEW</span>}
                </div>
                <p className="text-sm tracking-wide text-[#FFE9A8] font-bold uppercase flex flex-wrap items-center gap-2 animate-fadeUp-1 break-words leading-relaxed"><span className="w-8 h-px bg-[#FFE9A8] inline-block" /> The Private Tipster Standard</p>
                <h1 className="font-display text-[clamp(44px,8vw,96px)] leading-[1.1] font-black mt-4 animate-fadeUp-1 break-words overflow-visible pr-3 pb-1" style={{ letterSpacing: 'normal' }}>WAYNE<br /><span className="gold-text">BETTING TIPS</span></h1>
                <p className="mt-6 max-w-[620px] text-base leading-relaxed text-white animate-fadeUp-2 break-words">Daily. Verified. Disciplined. <span className="text-white font-bold">A premium selection, curated with care — not noise.</span> Choose a window to see today’s tips, VIP access, past results, or how to get in touch.</p>
                <div className="mt-8 flex flex-wrap gap-3 animate-fadeUp-2">
                  <button onClick={() => goTo('free')} className={`${btnBase} bg-emerald-600 hover:bg-emerald-500 text-white`}>View Free Tips <ArrowRight size={16} /></button>
                  <button onClick={() => goTo('vip')} className={`btn-gold shine ${btnBase}`}><Crown size={16} /> {vipActive ? 'View VIP Tips' : 'Join VIP'}</button>
                  <button onClick={() => goTo('history')} className={`${btnBase} bg-white/5 border border-white/10`}><History size={16} /> View History</button>
                  <button onClick={() => goTo('contact')} className={`${btnBase} bg-white/5 border border-white/10`}><Mail size={16} /> Contact</button>
                  <a href="https://wa.me/263776146008?text=Hi%20Wayne%2C%20I%20want%20to%20join%20VIP%20Betting%20Tips" target="_blank" rel="noopener" aria-label="Chat on WhatsApp" title="Chat on WhatsApp" className="h-12 w-12 min-w-[48px] rounded-full bg-[#25D366]/20 border border-[#25D366]/40 flex items-center justify-center"><MessageCircle size={21} className="text-[#25D366]" /></a>
                </div>
                <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3 animate-fadeUp-3">
                  {[{ v: loading ? '…' : String(tips.length), l: 'Tips live', note: 'Curated by the owner' }, { v: loading ? '…' : String(freeTips.length), l: 'Free tips', note: 'In Free Tips window' }, { v: historyStats.total > 0 ? `${Math.round(historyStats.winRate)}%` : '—', l: 'History win rate', note: `${historyStats.won} Won • ${historyStats.lost} Lost` }].map(s => (<div key={s.l} className="glass glass-hover rounded-2xl p-5 sm:p-6 break-words"><div className="gold-text font-display text-2xl sm:text-3xl font-black leading-tight break-words">{s.v}</div><div className="text-sm tracking-wide uppercase font-bold mt-3 text-white break-words leading-relaxed">{s.l}</div><div className="text-sm text-white mt-1 break-words leading-relaxed">{s.note}</div></div>))}
                </div>
                <p className="mt-5 text-sm text-white flex gap-2 leading-relaxed break-words"><Info size={16} className="shrink-0 mt-1 text-[#FFE9A8]" /> Past results do not predict future outcomes.</p>
              </div>
            </div>
          </section>
        )}

        {activeTab === 'free' && (
          <section className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 py-10 sm:py-14 animate-fadeUp">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="min-w-0"><p className={eyebrow}><Target size={16} /> Free Tips</p><h2 className="font-display text-2xl sm:text-4xl font-black tracking-tight leading-tight mt-3 break-words">Today’s Free Tips</h2><p className="text-sm text-white mt-3 flex flex-wrap items-center gap-1.5 leading-relaxed break-words"><Calendar size={16} className="text-[#FFE9A8] shrink-0" /> {today} • Today’s tips only — yesterday’s tips move to History • Sorted by kick-off, earliest first</p></div>
              <span className="inline-flex flex-wrap items-center gap-2 rounded-full border border-[var(--border)] bg-white/5 px-4 py-3 text-sm font-bold text-[#FFE9A8] break-words leading-relaxed"><Sparkles size={16} /> {freeTips.length} tip{freeTips.length === 1 ? '' : 's'} live today</span>
            </div>
            <div className="gold-line w-full my-7" />
            {loading && <p className="text-sm text-white leading-relaxed break-words">Loading saved tips…</p>}
            {freeTips.length > 0 && (<ul className="rounded-2xl glass divide-y divide-white/5">{freeTips.map((t, i) => renderTipRow(t, i))}</ul>)}
            {freeTips.length === 0 && !loading && (<div className="glass rounded-2xl p-6 sm:p-8 text-center break-words"><p className="font-display text-xl sm:text-2xl font-bold text-white leading-relaxed">No free tips for today yet.</p><p className="text-sm text-white mt-2 leading-relaxed">Only today’s tips show here. Yesterday’s tips have moved to History. Check back soon — new tips are added daily.</p><button onClick={() => goTo('vip')} className={`btn-gold mt-5 ${btnBase}`}><Crown size={16} /> Explore VIP</button></div>)}
          </section>
        )}

        {activeTab === 'vip' && (
          <section className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 py-10 sm:py-14 animate-fadeUp">
            <div className="text-center max-w-[680px] mx-auto mb-9 break-words">
              <p className={`${eyebrow} justify-center`}><Crown size={16} /> VIP Tips</p>
              <h2 className="font-display text-2xl sm:text-4xl font-black tracking-tight mt-3 leading-tight break-words">The <span className="gold-text italic">Inner Circle</span></h2>
              <p className="text-sm text-white mt-3 leading-relaxed">{vipActive ? 'VIP is active on this device. Your full VIP selections are unlocked below.' : 'Full VIP selections are for VIP members. Enter your VIP code, or request access below.'}</p>
              {vipActive ? (
                <div className="mt-5 max-w-[520px] mx-auto rounded-2xl border border-emerald-400 bg-emerald-500/10 p-5 text-left break-words">
                  <p className="flex flex-wrap items-center gap-2 font-bold text-sm text-white leading-relaxed"><CheckCircle2 size={16} /> VIP Active — Expires on {formatExpiry(activeVipExpiresAt)} — {activeDaysLeft === null ? '' : `${activeDaysLeft} day${activeDaysLeft === 1 ? '' : 's'} left`}</p>
                  <div className="mt-3 h-2.5 rounded-full bg-black/40 overflow-hidden" role="progressbar" aria-valuenow={Math.round(activeProgress)} aria-valuemin={0} aria-valuemax={100} aria-label="Days of VIP remaining"><div className={`h-full rounded-full ${activeExpiringSoon ? 'bg-amber-400' : 'bg-emerald-400'}`} style={{ width: `${activeProgress}%` }} /></div>
                  <p className="mt-2 text-sm text-white leading-relaxed break-words">Code {activeVipCode} • {activeVipPlan || 'VIP Monthly'} • {activeDaysLeft === null ? '' : `${activeDaysLeft} of ${activeTotalDays} days left`}</p>
                  {activeExpiringSoon && <p className="mt-2 text-sm font-bold text-white leading-relaxed">Your VIP expires in {activeDaysLeft} day{activeDaysLeft === 1 ? '' : 's'} — Renew now</p>}
                  {activeExpiringSoon && <div className="mt-2 flex flex-wrap gap-2"><button onClick={() => openJoin(activeVipPlan === 'VIP Yearly' ? 'VIP Yearly' : 'VIP Monthly')} className={`btn-gold ${btnBase}`}>Renew VIP</button><a href="https://wa.me/263776146008?text=Hi%20Wayne%2C%20I%20want%20to%20renew%20my%20VIP" target="_blank" rel="noopener" className={`${btnBase} bg-[#25D366]/20 border border-[#25D366]/40 text-white`}><MessageCircle size={16} className="text-[#25D366]" /> WhatsApp Wayne</a></div>}
                </div>
              ) : (
                <button onClick={() => openJoin('VIP Monthly')} className={`btn-gold shine mt-6 ${btnBase}`}><Crown size={16} /> Request VIP Access</button>
              )}
            </div>

            {!vipActive ? (
              <div className="glass rounded-[28px] p-5 sm:p-8 max-w-[720px] mx-auto text-center relative break-words">
                <span className="mx-auto w-16 h-16 rounded-3xl bg-gradient-to-br from-[#FFF0B8] to-[#C9A24B] text-black flex items-center justify-center"><Lock size={28} /></span>
                <h3 className="font-display font-black text-xl sm:text-2xl mt-5 text-white leading-relaxed">VIP Members Only</h3>
                <p className="text-sm text-white mt-2 leading-relaxed max-w-[480px] mx-auto">VIP Tips are locked. After you pay, Wayne sends you a VIP code. Enter it below to unlock the full selections.</p>
                <form onSubmit={handleUnlockVip} className="mt-6 flex flex-col sm:flex-row gap-2 max-w-[520px] mx-auto">
                  <label htmlFor="vip-code" className="text-sm font-bold text-white text-left">Enter VIP Code</label>
                  <input id="vip-code" value={vipCodeInput} onChange={e => setVipCodeInput(e.target.value.toUpperCase())} placeholder="Enter VIP Code — e.g. WAYNE-VIP-XXXX" autoComplete="off" className="flex-1 min-w-0 px-4 py-3 rounded-full text-sm font-bold" />
                  <button type="submit" disabled={vipUnlocking} className={`btn-gold ${btnBase} disabled:opacity-60 shrink-0`}><Unlock size={16} />{vipUnlocking ? 'Checking…' : 'Unlock VIP'}</button>
                </form>
                {vipUnlockError && <p className="mt-3 text-sm text-white bg-amber-500/20 border border-amber-400 rounded-2xl px-4 py-3 text-left max-w-[520px] mx-auto leading-relaxed break-words">{vipUnlockError}</p>}
                {vipExpiredInfo && !vipActive && <div className="mt-3 max-w-[520px] mx-auto rounded-2xl border border-red-400 bg-red-500/20 p-4 text-left break-words"><p className="font-bold text-sm text-white leading-relaxed">This code has expired on {formatExpiry(vipExpiredInfo.expiresAt)}. Please renew VIP</p><div className="mt-3 flex flex-wrap gap-2"><button onClick={() => openJoin('VIP Monthly')} className={`btn-gold ${btnBase}`}>Renew VIP</button><a href="https://wa.me/263776146008?text=Hi%20Wayne%2C%20my%20VIP%20code%20has%20expired.%20I%20want%20to%20renew." target="_blank" rel="noopener" className={`${btnBase} bg-[#25D366]/20 border border-[#25D366]/40 text-white`}><MessageCircle size={16} className="text-[#25D366]" /> WhatsApp Wayne</a></div></div>}
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <button onClick={() => openJoin('VIP Monthly')} className={`${btnBase} bg-white/5 border border-white/10 text-white`}><Crown size={16} className="text-[#FFE9A8]" /> Request VIP Access</button>
                  <a href="https://wa.me/263776146008?text=Hi%20Wayne%2C%20I%20paid%20for%20VIP.%20Please%20send%20my%20VIP%20code." target="_blank" rel="noopener" className={`${btnBase} bg-[#25D366]/20 border border-[#25D366]/40 text-white`}><MessageCircle size={16} className="text-[#25D366]" /> WhatsApp Wayne</a>
                </div>
                <p className="mt-4 text-sm text-white leading-relaxed">Paid? <strong className="text-white">WhatsApp Wayne to get your VIP code.</strong></p>
                <p className="text-sm text-white mt-1 leading-relaxed break-words">Pay with EcoCash, InnBucks, or Bank Transfer — then send your proof on WhatsApp or email <a href="mailto:tadiwagombakomba35@gmail.com" className="text-[#FFE9A8] underline underline-offset-2 break-all">tadiwagombakomba35@gmail.com</a>.</p>
              </div>
            ) : (
              <div className="glass rounded-3xl p-5 sm:p-7 break-words">
                <div className="flex flex-wrap items-center justify-between gap-3"><div className="min-w-0"><h3 className="font-display font-black text-xl flex flex-wrap items-center gap-2 text-white leading-relaxed"><Crown size={20} className="text-[#FFE9A8]" /> VIP Tips — Unlocked</h3><p className="text-sm text-white mt-1 leading-relaxed">Full VIP selections for active members. Code: <strong className="text-white break-all">{activeVipCode}</strong> • {activeVipPlan || 'VIP Monthly'} • Expires on <strong className="text-white">{formatExpiry(activeVipExpiresAt)}</strong> — <strong className="text-white">{activeDaysLeft === null ? '' : `${activeDaysLeft} day${activeDaysLeft === 1 ? '' : 's'} left`}</strong></p><div className="mt-3 h-2.5 max-w-[420px] rounded-full bg-black/40 overflow-hidden" role="progressbar" aria-valuenow={Math.round(activeProgress)} aria-valuemin={0} aria-valuemax={100} aria-label="Days of VIP remaining"><div className={`h-full rounded-full ${activeExpiringSoon ? 'bg-amber-400' : 'bg-emerald-400'}`} style={{ width: `${activeProgress}%` }} /></div>{activeExpiringSoon && <p className="mt-2 text-sm font-bold text-white leading-relaxed">Your VIP expires in {activeDaysLeft} day{activeDaysLeft === 1 ? '' : 's'} — Renew now</p>}</div><button onClick={handleLockVip} className={`${btnBase} bg-white/5 border border-white/10 text-white`}><Lock size={16} /> Lock VIP</button></div>
                {vipPendingTips.length > 0 ? (<ul className="mt-6 rounded-2xl glass divide-y divide-white/5">{vipPendingTips.map((t, i) => renderTipRow(t, i))}</ul>) : (<p className="mt-4 text-sm text-white leading-relaxed">No VIP tips for today right now — check back soon. Yesterday’s VIP tips have moved to History.</p>)}
              </div>
            )}

            {!vipActive && (
              <div className="glass rounded-3xl p-5 sm:p-7 mt-6 break-words">
                <div className="flex flex-wrap items-center justify-between gap-3"><div className="min-w-0"><h3 className="font-display font-black text-xl flex flex-wrap items-center gap-2 text-white leading-relaxed"><Crown size={20} className="text-[#FFE9A8]" /> VIP Tips Preview</h3><p className="text-sm text-white mt-1 leading-relaxed">A preview for daily visitors. Full VIP selections are for VIP members.</p></div><span className="inline-flex flex-wrap items-center gap-1.5 px-4 py-3 rounded-full bg-[#FFE9A8]/20 text-white border border-[var(--border)] text-sm font-bold break-words leading-relaxed"><Lock size={16} /> {vipPendingTips.length} VIP tip{vipPendingTips.length === 1 ? '' : 's'} live</span></div>
                {vipPendingTips.length > 0 ? (<div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">{vipPendingTips.slice(0, 3).map(t => (<div key={t.localId} className="glass glass-hover rounded-2xl p-5 break-words"><p className="text-sm font-bold tracking-wide uppercase text-[#FFE9A8] flex flex-wrap items-center gap-1.5 leading-relaxed"><Crown size={16} /> VIP Preview</p><p className="font-bold text-base mt-3 text-white leading-relaxed break-words"><span className="inline-flex flex-wrap items-center gap-1.5 font-black text-[#FFE9A8]"><Clock size={16} className="text-[#FFE9A8]" />{formatKickoff(t.kickoff) || '—'}</span><span className="text-white mx-2">-</span>{t.match}</p><p className="text-sm text-white mt-1 leading-relaxed">Tip hidden — join VIP to see the full selection.</p>{t.date && <p className="text-sm text-white mt-3 leading-relaxed">{formatDate(t.date)}</p>}</div>))}</div>) : (<p className="mt-4 text-sm text-white leading-relaxed">No VIP preview yet — check back soon.</p>)}
              </div>
            )}
            <div className="mt-12"><h3 className="font-display font-black text-2xl text-center text-white leading-relaxed">Choose your VIP plan</h3><p className="text-sm text-white text-center mt-2 leading-relaxed">Pick the plan that fits how you follow the tips.</p>
              <div className="mt-7 grid md:grid-cols-3 gap-4 items-stretch">
                {[{ name: 'Free', price: '$0', per: 'forever', desc: 'Daily free tips + results.', feats: ['2–3 free tips daily', 'Public results table', 'Weekly previews'], cta: 'Go to Free Tips', highlight: false }, { name: 'VIP Monthly', price: '$19', per: '/month', desc: 'The most popular tier.', feats: ['All VIP tips', 'Confidence & staking notes', 'Priority updates', 'Private community'], cta: 'Join Monthly — $19/mo', highlight: true }, { name: 'VIP Yearly', price: '$149', per: '/year', desc: 'Best value.', feats: ['Everything in Monthly', 'Yearly reports', 'Early access to features'], cta: 'Join Yearly — $149/yr', highlight: false }].map(p => (
                  <article key={p.name} className={`rounded-3xl p-[1px] flex ${p.highlight ? 'bg-gradient-to-b from-[#FFF0B8] via-[#D4AF6A] to-[#7A5E1F] md:-translate-y-2' : 'bg-[var(--border)]'}`}><div className={`rounded-[calc(1.5rem-1px)] p-6 sm:p-7 flex flex-col flex-1 ${p.highlight ? 'bg-[#141E18]' : 'bg-[#101914]'} break-words`}>
                    {p.highlight && <span className="self-start bg-gradient-to-r from-[#FFF0B8] to-[#D4AF6A] text-black text-sm tracking-wide font-black px-4 py-3 rounded-full mb-4 flex flex-wrap items-center gap-1 leading-relaxed"><Gem size={16} /> MOST POPULAR</span>}
                    <div className="flex flex-wrap items-center gap-2"><h4 className="font-display font-black text-xl text-white leading-relaxed">{p.name}</h4>{p.name === 'VIP Yearly' && <span className="bg-emerald-500 text-black text-sm tracking-wide font-black px-4 py-2 rounded-full break-words">SAVE 35%</span>}</div><div className="mt-3 flex flex-wrap items-baseline gap-1"><span className={`text-4xl font-black leading-tight break-words ${p.highlight ? 'gold-text' : 'text-white'}`}>{p.price}</span><span className="text-sm font-semibold text-white">{p.per}</span></div><p className="text-sm mt-2 text-white leading-relaxed">{p.desc}</p>
                    <ul className="mt-5 space-y-2.5 text-sm font-medium flex-1 leading-relaxed">{p.feats.map(f => <li key={f} className="flex gap-2 break-words"><span className="w-5 h-5 rounded-full bg-[#FFE9A8]/20 text-[#FFE9A8] flex items-center justify-center shrink-0 mt-0.5"><Check size={14} /></span><span className="text-white">{f}</span></li>)}</ul>
                    <button onClick={() => { if (p.name === 'Free') goTo('free'); else if (p.name === 'VIP Monthly') openJoin('VIP Monthly'); else openJoin('VIP Yearly'); }} className={`mt-6 ${btnBase} ${p.highlight ? 'btn-gold' : 'bg-white text-black hover:bg-white/90'}`}>{p.cta}</button>
                    <p className="mt-3 text-sm text-white leading-relaxed">{p.name === 'Free' ? 'Opens the Free Tips window.' : 'Opens Join VIP — choose payment and send your request.'}</p>
                  </div></article>))}
              </div>
            </div>
          </section>
        )}

        {activeTab === 'history' && (
          <section className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 py-10 sm:py-14 animate-fadeUp break-words">
            <p className={eyebrow}><History size={16} /> Past Tips History</p>
            <h2 className="font-display text-2xl sm:text-4xl font-black tracking-tight leading-tight mt-3 break-words">History — Previous Results</h2>
            <p className="text-sm text-white mt-3 leading-relaxed">Yesterday’s tips automatically move here when a new day starts — they are not deleted. Newest first. Use Today / Yesterday / Older to find a day.</p>
            <p className="mt-3 inline-flex flex-wrap items-center gap-2 rounded-full bg-amber-500/20 border border-amber-400 px-4 py-3 text-sm font-bold text-white leading-relaxed"><span className="inline-flex flex-wrap items-center gap-1.5 rounded-full bg-amber-400 px-3 py-1.5 text-sm font-black tracking-wide text-black">MANUAL ONLY</span> Results are marked manually by Wayne</p>
            <div className="mt-4 rounded-2xl bg-amber-500/20 border border-amber-400 p-4 flex gap-3"><AlertTriangle size={18} className="text-amber-300 shrink-0" /><p className="text-sm leading-relaxed text-white"><strong>MANUAL ONLY — Results are marked manually by Wayne.</strong> No results are automatic. After games finish, Wayne marks each tip Won or Lost. Nothing is marked for you.</p></div>
            <p className="mt-3 text-sm text-white leading-relaxed">Pending tips stay in History as PENDING and do NOT count in Win Rate until Wayne marks them manually.</p>
            <div className="grid lg:grid-cols-[300px_1fr] gap-4 my-6">
              <div className="glass rounded-3xl p-6 flex flex-col items-center text-center break-words">
                <p className="text-sm tracking-wide uppercase font-bold text-white flex flex-wrap items-center gap-1.5 leading-relaxed"><TrendingUp size={16} className="text-[#FFE9A8]" /> Win Rate</p>
                <div className="relative w-[158px] h-[158px] my-5"><svg width="158" height="158" viewBox="0 0 158 158"><circle cx="79" cy="79" r="62" fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="10" /><circle className="ring-progress" cx="79" cy="79" r="62" fill="none" stroke="url(#goldRing)" strokeWidth="10" strokeLinecap="round" strokeDasharray={ringC} strokeDashoffset={ringC * (1 - historyStats.winRate / 100)} /><defs><linearGradient id="goldRing" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#FFF0B8" /><stop offset="55%" stopColor="#D4AF6A" /><stop offset="100%" stopColor="#9A7B2E" /></linearGradient></defs></svg><div className="absolute inset-0 flex flex-col items-center justify-center"><span className="font-display text-2xl font-black gold-text leading-tight">{historyStats.total > 0 ? `${historyStats.winRate.toFixed(1).replace(/\.0$/, '')}%` : '—'}</span><span className="text-sm tracking-wide uppercase text-white mt-1">Win rate</span></div></div>
                <p className="text-sm text-white leading-relaxed">{historyStats.total > 0 ? `${historyStats.won} Won of ${historyStats.total} settled` : 'No settled tips yet'}</p><p className="text-sm text-white mt-2 leading-relaxed">Win Rate = Won ÷ (Won + Lost)</p>
              </div>
              <div className="flex flex-col gap-3 min-w-0">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="glass rounded-2xl p-4 sm:p-5 break-words"><p className="text-sm font-bold uppercase tracking-wide text-white leading-relaxed">Total Tips</p><p className="font-display text-2xl sm:text-3xl font-black leading-tight mt-2 text-white">{historyStats.total}</p><p className="text-sm text-white mt-1.5 leading-relaxed">Settled tips</p></div>
                  <div className="glass rounded-2xl p-4 sm:p-5 break-words"><p className="text-sm font-bold uppercase tracking-wide text-white flex flex-wrap items-center gap-1.5 leading-relaxed"><CheckCircle2 size={16} /> Won</p><p className="font-display text-2xl sm:text-3xl font-black leading-tight mt-2 text-emerald-300">{historyStats.won}</p><p className="text-sm text-white mt-1.5 leading-relaxed">Marked Won</p></div>
                  <div className="glass rounded-2xl p-4 sm:p-5 break-words"><p className="text-sm font-bold uppercase tracking-wide text-white flex flex-wrap items-center gap-1.5 leading-relaxed"><XCircle size={16} /> Lost</p><p className="font-display text-2xl sm:text-3xl font-black leading-tight mt-2 text-red-300">{historyStats.lost}</p><p className="text-sm text-white mt-1.5 leading-relaxed">Marked Lost</p></div>
                </div>
                <div className="glass rounded-2xl p-4 flex flex-wrap gap-2" role="group" aria-label="Filter history">{filterButtons.map(f => { const active = historyFilter === f; const count = f === 'All' ? historyTips.length : f === 'Won' ? historyStats.won : f === 'Lost' ? historyStats.lost : f === 'Today' ? historyTips.filter(t => t.date === todayIso).length : f === 'Yesterday' ? historyTips.filter(t => t.date === yesterdayIso).length : f === 'Older' ? historyTips.filter(t => !!t.date && t.date < yesterdayIso).length : f === 'This Week' ? historyTips.filter(t => inWeek(t.date, 0)).length : historyTips.filter(t => inWeek(t.date, -1)).length; return (<button key={f} onClick={() => setHistoryFilter(f)} aria-pressed={active} className={`px-4 py-3 rounded-full text-sm font-bold border break-words leading-relaxed ${active ? 'bg-gradient-to-r from-[#FFF0B8] to-[#C9A24B] text-black border-transparent' : 'bg-white/5 border-white/10 text-white hover:text-white'}`}>{f} <span className="opacity-80 font-semibold">({count})</span></button>); })}</div>
                {historyError && <p className="text-sm text-white bg-amber-500/20 border border-amber-400 rounded-2xl px-4 py-3 leading-relaxed break-words">{historyError}</p>}
                {filteredHistory.length === 0 ? (<div className="glass rounded-2xl p-6 text-center flex-1 flex flex-col justify-center break-words"><p className="text-base font-bold text-white leading-relaxed">No history yet{historyFilter !== 'All' ? ` for ${historyFilter}` : ''}.</p><p className="text-sm text-white mt-1 leading-relaxed">When the owner marks a tip as Won or Lost, it will appear here and update the Win Rate.</p></div>) : (
                  <div className="glass rounded-2xl flex-1 break-words"><div className="overflow-x-auto"><div className="min-w-[560px]"><div className="hidden sm:grid grid-cols-[140px_1fr_92px] gap-3 px-5 py-3 text-sm font-bold uppercase tracking-wide text-white border-b border-white/5"><span>Date • Kick-Off</span><span>Match — Tip</span><span className="text-right">Result</span></div><ul className="divide-y divide-white/5">{filteredHistory.map(t => (<li key={t.localId} className="px-4 sm:px-5 py-4"><div className="flex flex-wrap items-center gap-x-3 gap-y-2"><span className="text-sm font-semibold text-white w-full sm:w-[140px] sm:shrink-0 leading-relaxed break-words"><span className="flex flex-wrap items-center gap-1.5"><Calendar size={16} className="shrink-0 text-[#FFE9A8]" />{t.date ? formatDate(t.date) : '—'}</span><span className="flex flex-wrap items-center gap-1.5 font-black text-[#FFE9A8] mt-1"><Clock size={16} className="text-[#FFE9A8]" />{formatKickoff(t.kickoff) || '—'}</span></span><p className="text-base leading-relaxed flex-1 min-w-[180px] break-words"><span className="font-bold text-white">Match: {t.match}</span><span className="text-white"> — </span><span className="font-semibold text-[#FFE9A8]">Tip: {t.tip}</span>{formatOdds(t.odds) && <span className="ml-1.5 text-base font-bold text-[#FFE9A8] break-words">Odds {formatOdds(t.odds)}</span>}<span className="block sm:inline text-sm text-white sm:ml-2">{t.type === 'VIP' ? 'VIP' : 'Free'}</span></p>{t.result === 'Pending' && <span className="inline-flex flex-wrap items-center px-4 py-2 rounded-full bg-amber-500/20 border border-amber-400 text-white text-sm font-black tracking-wide break-words leading-relaxed">{t.date === yesterdayIso ? 'Yesterday - Awaiting Result' : t.date && t.date < yesterdayIso ? 'Older - Awaiting Result' : 'Awaiting Result'}</span>}<span className={`inline-flex flex-wrap items-center gap-1.5 px-4 py-2 rounded-full border text-sm font-black tracking-wide break-words ${resultBadgeClass(t.result)}`}>{t.result === 'Won' ? <CheckCircle2 size={16} /> : t.result === 'Lost' ? <XCircle size={16} /> : <Clock size={16} />}{t.result === 'Won' ? 'WON' : t.result === 'Lost' ? 'LOST' : 'PENDING'}</span>{isAdmin && t.result === 'Pending' && <span className="flex flex-wrap gap-2"><button onClick={() => updateTipResult(t, 'Won')} disabled={resultBusy === t.localId} className="px-4 py-3 rounded-full bg-emerald-500/20 border border-emerald-400 text-white text-sm font-bold disabled:opacity-50 break-words">Mark Won</button><button onClick={() => updateTipResult(t, 'Lost')} disabled={resultBusy === t.localId} className="px-4 py-3 rounded-full bg-red-500/20 border border-red-400 text-white text-sm font-bold disabled:opacity-50 break-words">Mark Lost</button></span>}</div></li>))}</ul></div></div></div>)}
              </div>
            </div>
            <p className="text-sm text-white leading-relaxed break-words">History shows settled tips only. Win Rate = Won ÷ (Won + Lost). Results are MANUAL only — Results are marked manually by Wayne.</p>
          </section>
        )}

        {activeTab === 'contact' && (
          <section className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 py-10 sm:py-14 animate-fadeUp">
            <div className="glass rounded-[28px] p-5 sm:p-10 grid lg:grid-cols-2 gap-10 relative break-words">
              <div className="relative min-w-0">
                <p className={eyebrow}><Mail size={16} /> Contact</p>
                <h2 className="font-display text-2xl sm:text-4xl font-black tracking-tight leading-tight mt-3 break-words">Questions about<br /><span className="gold-text italic">Wayne Betting Tips?</span></h2>
                <p className="text-base leading-relaxed text-white mt-4 max-w-[420px]">Send a message and our team will get back to you.</p>
                <a href="mailto:tadiwagombakomba35@gmail.com" className="mt-6 inline-flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--border)] bg-black/20 px-4 py-3.5"><span className="w-10 h-10 rounded-full bg-gradient-to-br from-[#FFF0B8] to-[#C9A24B] text-black flex items-center justify-center shrink-0"><Mail size={18} /></span><span className="min-w-0"><span className="block text-sm tracking-wide uppercase text-white font-bold">Email us</span><span className="block text-sm font-bold text-[#FFE9A8] break-all">tadiwagombakomba35@gmail.com</span></span></a>
                <a href="https://wa.me/263776146008?text=Hi%20Wayne%2C%20I%20want%20to%20join%20VIP%20Betting%20Tips" target="_blank" rel="noopener" className="mt-3 flex flex-wrap items-center gap-3 rounded-2xl border border-[#25D366]/30 bg-[#25D366]/10 px-4 py-3.5"><span className="w-10 h-10 rounded-full bg-[#25D366] text-white flex items-center justify-center shrink-0"><MessageCircle size={18} /></span><span className="text-sm font-bold text-white">Chat on WhatsApp</span></a>
                <div className="mt-6 space-y-3 text-sm leading-relaxed"><p className="break-words"><span className="text-white w-20 inline-block">Hours</span><strong className="text-white">Mon–Fri, 9:00–17:00</strong></p><p className="break-words"><span className="text-white w-20 inline-block">Note</span><strong className="text-white">We reply within one business day</strong></p></div>
                <div className="mt-6 rounded-2xl bg-amber-500/20 border border-amber-400 p-4 flex gap-3"><AlertTriangle size={18} className="text-amber-300 shrink-0" /><p className="text-sm leading-relaxed text-white"><strong>18+ only.</strong> Betting involves risk, please bet responsibly. If you need support, contact BeGambleAware.org.</p></div>
              </div>
              <form onSubmit={handleContact} className="space-y-4 relative min-w-0">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="field"><label htmlFor="c-name">Name</label><input id="c-name" placeholder="Your name" value={contactData.name} onChange={e => setContactData(s => ({ ...s, name: e.target.value }))} className="w-full px-4 py-3 rounded-2xl text-sm" required /></div>
                  <div className="field"><label htmlFor="c-email">Email</label><input id="c-email" type="email" placeholder="Your email" value={contactData.email} onChange={e => setContactData(s => ({ ...s, email: e.target.value }))} className="w-full px-4 py-3 rounded-2xl text-sm" required /></div>
                </div>
                <div className="field"><label htmlFor="c-msg">Message</label><textarea id="c-msg" placeholder="Write your message here" value={contactData.message} onChange={e => setContactData(s => ({ ...s, message: e.target.value }))} rows={5} className="w-full px-4 py-4 rounded-2xl text-sm resize-none" required /></div>
                {contactError && <div className="text-sm text-white bg-red-500/20 border border-red-400 rounded-xl px-4 py-3 leading-relaxed break-words">{contactError}</div>}
                {formStatus === 'sent' && <div className="text-sm text-white bg-emerald-500/20 border border-emerald-400 rounded-xl px-4 py-3 flex gap-2 leading-relaxed break-words"><Check size={16} /> Thank you! We will reply from tadiwagombakomba35@gmail.com</div>}
                <button type="submit" disabled={formStatus === 'sending'} className={`btn-gold shine w-full ${btnBase} disabled:opacity-60`}>{formStatus === 'sending' ? 'Sending…' : 'Send message'} <ArrowRight size={16} /></button>
                <p className="text-sm text-center text-white leading-relaxed">We reply within one business day.</p>
              </form>
            </div>
          </section>
        )}

        {activeTab === 'admin' && (
          <section className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 py-10 sm:py-14 animate-fadeUp break-words">
            {!isAdmin ? (
              <div className="max-w-[480px] mx-auto glass rounded-[24px] p-5 sm:p-8 break-words">
                <span className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#FFF0B8] to-[#C9A24B] text-black flex items-center justify-center"><Lock size={20} /></span>
                <h2 className="font-display font-black text-2xl mt-5 text-white leading-relaxed">Admin Login</h2><p className="text-sm text-white mt-1 leading-relaxed">Owner only. Enter the admin password to open the Admin window.</p>
                <form onSubmit={handleLogin} className="mt-6 space-y-4"><div className="field"><label htmlFor="admin-password">Admin Password</label><input id="admin-password" type="password" autoFocus placeholder="Enter admin password" value={password} onChange={e => setPassword(e.target.value)} className="w-full px-4 py-3 rounded-2xl text-sm" /></div>
                  {loginError && <p className="text-sm text-white bg-amber-500/20 border border-amber-400 rounded-2xl px-4 py-3 leading-relaxed">{loginError}</p>}
                  <button type="submit" disabled={loggingIn || !password} className={`btn-gold w-full ${btnBase} disabled:opacity-60`}><Lock size={16} />{loggingIn ? 'Checking…' : 'Log in as Admin'}</button>
</form>
              </div>
            ) : (
              <div>
                <div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><p className={eyebrow}><ShieldCheck size={16} /> Admin</p><h2 className="font-display text-2xl sm:text-4xl font-black tracking-tight mt-2 leading-tight">Admin <span className="gold-text italic">Window</span></h2><p className="text-sm text-white mt-3 max-w-[620px] leading-relaxed">Add tips, manage history, and mark results here.</p><div className="mt-4 inline-flex flex-wrap items-center gap-2 rounded-2xl bg-amber-500/20 border border-amber-400 px-4 py-3 text-sm font-bold text-white leading-relaxed break-words"><span className="inline-flex flex-wrap items-center gap-1.5 rounded-full bg-amber-400 px-3 py-1.5 text-sm font-black tracking-wide text-black">MANUAL ONLY</span> Manual Results - You mark Won/Lost yourself</div><p className="mt-2 text-sm text-white leading-relaxed">Results are MANUAL only. No results are automatic — you mark every tip Won or Lost yourself.</p></div><button onClick={handleLogout} className={`${btnBase} bg-white text-black`}><LogOut size={16} /> Logout — Return to Home</button></div>

                <div className="mt-6 glass rounded-3xl p-5 sm:p-7 break-words">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0"><h3 className="font-display font-black text-xl flex flex-wrap items-center gap-2 text-white leading-relaxed"><ShieldCheck size={20} className="text-[#FFE9A8]" /> Permanent Connection</h3><p className="text-sm text-white mt-1 max-w-[640px] leading-relaxed">Tips, VIP codes and VIP requests are saved through this app’s built-in permanent records connection. Connected forever - no need to paste key.</p></div>
                    <span className={`inline-flex flex-wrap items-center gap-2 px-4 py-3 rounded-full border text-sm font-bold break-words leading-relaxed ${connectionStatus === 'connected' ? 'bg-emerald-500/20 border-emerald-400 text-white' : connectionStatus === 'not-connected' ? 'bg-amber-500/20 border-amber-400 text-white' : 'bg-white/5 border-white/10 text-white'}`}><span className={`w-2 h-2 rounded-full ${connectionStatus === 'connected' ? 'bg-emerald-400' : connectionStatus === 'not-connected' ? 'bg-amber-400' : 'bg-white/40'}`} />{connectionStatus === 'connected' ? 'Connected ✅' : connectionStatus === 'not-connected' ? 'Not Connected — Please Retry' : 'Checking…'}</span>
                  </div>
                  <div className="mt-4 grid sm:grid-cols-2 gap-3">
                    <div className="field"><label htmlFor="conn-mode">Connection</label><input id="conn-mode" value="Permanent — built in" disabled readOnly className="w-full px-4 py-3 rounded-2xl text-sm opacity-80" /></div>
                    <div className="field"><label htmlFor="conn-key">Key / Secret</label><input id="conn-key" value="Not required — no key to paste" disabled readOnly className="w-full px-4 py-3 rounded-2xl text-sm opacity-80" /></div>
                  </div>
                  <div className="mt-4 grid sm:grid-cols-3 gap-2 text-sm leading-relaxed">
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-4 break-words"><p className="font-bold text-white">Tips (Free + VIP)</p><p className="text-white mt-1">Collection: prime_tips</p></div>
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-4 break-words"><p className="font-bold text-white">VIP codes</p><p className="text-white mt-1">Collection: vip_codes</p></div>
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-4 break-words"><p className="font-bold text-white">VIP requests + messages</p><p className="text-white mt-1">Collection: inquiries</p></div>
                  </div>
                  <p className="mt-3 text-sm text-white leading-relaxed break-words">The connection fields above are pre-filled and locked. Nothing is stored only on this device — if a save fails, it is shown as not saved so you can retry.</p>
                  {connectionMessage && <p className="mt-3 text-sm text-white leading-relaxed break-words">{connectionMessage}</p>}
                  <button onClick={testConnection} disabled={testingConnection} className={`btn-gold mt-4 ${btnBase} disabled:opacity-60`}>{testingConnection ? 'Testing…' : 'Test Connection'}</button>
                </div>

                <div className="mt-6 glass rounded-3xl p-5 sm:p-7 border-amber-500/30 break-words">
                  <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h3 className="font-display font-black text-xl flex flex-wrap items-center gap-2 text-white leading-relaxed"><Clock size={20} className="text-amber-300" /> Pending Results</h3><p className="text-sm font-bold text-white mt-2 leading-relaxed">Manual Results - You mark Won/Lost yourself</p><p className="text-sm text-white mt-1 max-w-[640px] leading-relaxed">Yesterday’s tips that are still Pending — clear them in 1 minute each morning. They were automatically moved out of Free / VIP Tips into History at midnight. They are not deleted and do NOT count in Win Rate until you mark them manually.</p></div><span className="inline-flex flex-wrap items-center px-4 py-3 rounded-full bg-amber-500/20 border border-amber-400 text-white text-sm font-bold break-words leading-relaxed">{pendingPastTips.length} awaiting result{pendingPastTips.length === 1 ? '' : 's'}</span></div>
                  <div className="mt-4 rounded-2xl bg-amber-500/20 border border-amber-400 p-4 flex gap-3"><AlertTriangle size={18} className="text-amber-300 shrink-0" /><p className="text-sm leading-relaxed text-white"><strong>MANUAL ONLY — Results are marked manually by Wayne.</strong> No results are automatic. After games finish, mark each tip Won or Lost yourself.</p></div>
                  {pendingPastTips.length === 0 ? (<p className="mt-4 text-sm text-white leading-relaxed">All clear — no pending results from yesterday or earlier. New pending tips will appear here after midnight.</p>) : (<ul className="mt-4 space-y-2">{pendingPastTips.map(t => (<li key={t.localId} className="rounded-2xl border border-white/5 bg-black/20 p-4 break-words"><div className="flex flex-wrap items-center gap-2"><span className={`text-sm font-black px-3 py-2 rounded-full break-words ${t.type === 'VIP' ? 'bg-[#FFE9A8] text-black' : 'bg-white/10 text-white'}`}>{t.type}</span><span className="inline-flex flex-wrap items-center px-4 py-2 rounded-full bg-amber-500/20 border border-amber-400 text-white text-sm font-black break-words leading-relaxed">{t.date === yesterdayIso ? 'Yesterday - Awaiting Result' : t.date && t.date < yesterdayIso ? 'Older - Awaiting Result' : 'Awaiting Result'}</span><p className="text-base leading-relaxed flex-1 min-w-[180px] break-words"><span className="inline-flex flex-wrap items-center gap-1.5 font-black text-[#FFE9A8]"><Clock size={16} className="text-[#FFE9A8]" />{formatKickoff(t.kickoff) || '—'}</span><span className="text-white mx-2">-</span><span className="font-bold text-white">Match: {t.match}</span><span className="text-white"> — </span><span className="font-semibold text-[#FFE9A8]">Tip: {t.tip}</span>{formatOdds(t.odds) && <span className="ml-2 text-base font-bold text-[#FFE9A8] break-words">Odds {formatOdds(t.odds)}</span>}{t.date && <span className="block text-sm text-white">{formatDate(t.date)} • Kick-off {formatKickoff(t.kickoff) || '—'}</span>}</p></div><div className="mt-3 flex flex-wrap gap-2"><button onClick={() => updateTipResult(t, 'Won')} disabled={resultBusy === t.localId} className="px-4 py-3 rounded-full bg-emerald-500/20 border border-emerald-400 text-white text-sm font-bold disabled:opacity-50 break-words">Mark Won</button><button onClick={() => updateTipResult(t, 'Lost')} disabled={resultBusy === t.localId} className="px-4 py-3 rounded-full bg-red-500/20 border border-red-400 text-white text-sm font-bold disabled:opacity-50 break-words">Mark Lost</button><button onClick={() => startEdit(t)} className="px-4 py-3 rounded-full bg-white/10 text-sm font-bold text-white break-words">Edit</button></div></li>))}</ul>)}
                </div>

                <div className="mt-6 glass rounded-3xl p-5 sm:p-7 break-words">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0"><h3 className="font-display font-black text-xl flex flex-wrap items-center gap-2 text-white leading-relaxed"><Key size={20} className="text-[#FFE9A8]" /> VIP Access Management</h3><p className="text-sm text-white mt-1 max-w-[620px] leading-relaxed">How you give access after payment: choose a plan, generate a code, copy it, and send it to the payer on WhatsApp. They enter it in the VIP window to unlock. Codes are saved in the database, so they work across devices.</p></div>
                    <button onClick={handleGenerateCode} disabled={generatingCode} className={`btn-gold ${btnBase} disabled:opacity-60`}><Plus size={16} />{generatingCode ? 'Generating…' : 'Generate New VIP Code'}</button>
                  </div>
                  <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4 break-words">
                    <p className="text-sm font-bold uppercase tracking-wide text-white leading-relaxed">Generate Code — Choose Plan &amp; Expiry</p>
                    <div className="mt-3 grid sm:grid-cols-3 gap-2" role="group" aria-label="Code plan">
                      {(['VIP Monthly', 'VIP Yearly', 'Custom'] as VipPlan[]).map(p => (<button key={p} type="button" onClick={() => setGeneratePlan(p)} aria-pressed={generatePlan === p} className={`px-4 py-3 rounded-full border text-sm font-bold break-words leading-relaxed ${generatePlan === p ? 'bg-gradient-to-r from-[#FFF0B8] to-[#C9A24B] text-black border-transparent' : 'bg-white/5 border-white/10 text-white hover:text-white'}`}>{p === 'VIP Monthly' ? 'Monthly — 30 days' : p === 'VIP Yearly' ? 'Yearly — 365 days' : 'Custom days'}</button>))}
                    </div>
                    {generatePlan === 'Custom' && <div className="mt-3 flex flex-wrap items-center gap-2"><label htmlFor="custom-days" className="text-sm font-bold text-white">Custom expiry (days)</label><input id="custom-days" type="number" min={1} max={3650} value={customDays} onChange={e => setCustomDays(Number(e.target.value))} className="w-28 px-4 py-3 rounded-full text-sm font-bold" /></div>}
                    <p className="mt-3 text-sm text-white leading-relaxed break-words">New code will expire in <strong className="text-white">{planDays(generatePlan, customDays)} days</strong> — on <strong className="text-white">{formatExpiry(addDaysISO(new Date().toISOString(), planDays(generatePlan, customDays)))}</strong>. {generatePlan === 'Custom' ? 'Enter the number of days above.' : generatePlan === 'VIP Yearly' ? 'Yearly codes last 365 days.' : 'Monthly codes last 30 days.'}</p>
                  </div>

                  {lastGeneratedCode && (
                    <div className="mt-5 rounded-2xl border border-[var(--border-strong)] bg-black/30 p-4 break-words">
                      <p className="text-sm font-bold uppercase tracking-wide text-[#FFE9A8] leading-relaxed">Latest code {lastGeneratedFor ? `— for ${lastGeneratedFor}` : '— ready to send'}</p>
                      <div className="mt-2 flex flex-col sm:flex-row gap-2">
                        <label htmlFor="latest-vip-code" className="text-sm font-bold text-white">Latest VIP code</label>
                        <input id="latest-vip-code" readOnly value={lastGeneratedCode} onFocus={e => e.target.select()} className="flex-1 min-w-0 px-4 py-3 rounded-2xl font-black tracking-wide text-base text-left" />

                        <a href={`https://wa.me/263776146008?text=${encodeURIComponent(`Hi! Here is your VIP code for Wayne Betting Tips: ${lastGeneratedCode} — enter it in the VIP Tips window to unlock VIP.`)}`} target="_blank" rel="noopener" className={`${btnBase} bg-[#25D366]/20 border border-[#25D366]/40 text-white shrink-0`}><MessageCircle size={16} className="text-[#25D366]" /> Send via WhatsApp</a>
                      </div>
                      <p className="text-sm text-white mt-2 leading-relaxed">Send the code above to the payer via WhatsApp.</p>
                    </div>
                  )}

                  <form onSubmit={handleManualAdd} className="mt-5 grid sm:grid-cols-[1fr_1fr_auto] gap-2 items-end">
                    <div><label htmlFor="manual-code" className="text-sm font-bold uppercase tracking-wide text-white block mb-1.5 leading-relaxed">Manually add a code</label><input id="manual-code" value={manualCode} onChange={e => setManualCode(e.target.value.toUpperCase())} placeholder="WAYNE-VIP-XXXX" className="w-full px-4 py-3 rounded-full text-sm font-bold" /></div>
                    <div><label htmlFor="manual-usedby" className="text-sm font-bold uppercase tracking-wide text-white block mb-1.5 leading-relaxed">Used By (optional)</label><input id="manual-usedby" value={manualUsedBy} onChange={e => setManualUsedBy(e.target.value)} placeholder="Payer name / contact" className="w-full px-4 py-3 rounded-full text-sm" /></div>
                    <button type="submit" disabled={manualBusy} className={`${btnBase} bg-white/10 border border-white/10 text-white disabled:opacity-60`}>Add Code</button>
                  </form>
                  {manualError && <p className="mt-2 text-sm text-white bg-amber-500/20 border border-amber-400 rounded-2xl px-4 py-3 leading-relaxed break-words">{manualError}</p>}
                  {vipCodesError && <p className="mt-3 text-sm text-white bg-amber-500/20 border border-amber-400 rounded-2xl px-4 py-3 leading-relaxed break-words">{vipCodesError}</p>}

                  <div className="mt-6 grid lg:grid-cols-2 gap-4 items-start">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-display font-black text-lg flex flex-wrap items-center gap-2 text-white leading-relaxed"><Key size={18} className="text-[#FFE9A8]" /> Active VIP Codes</h4><button onClick={reloadVipCodes} disabled={vipCodesLoading} className="px-4 py-3 rounded-full bg-white/10 text-sm font-bold text-white disabled:opacity-60 break-words">{vipCodesLoading ? 'Loading…' : 'Refresh'}</button></div>
                      <p className="text-sm text-white mt-1 leading-relaxed">{codeCounts.Active} active • {codeCounts['Expiring Soon']} expiring soon • {codeCounts.Expired} expired • {sortedVipCodes.length} total codes</p>
                      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Filter VIP codes">{(['All', 'Active', 'Expiring Soon', 'Expired'] as CodeFilter[]).map(f => (<button key={f} type="button" onClick={() => setCodeFilter(f)} aria-pressed={codeFilter === f} className={`px-4 py-3 rounded-full text-sm font-bold border break-words leading-relaxed ${codeFilter === f ? 'bg-gradient-to-r from-[#FFF0B8] to-[#C9A24B] text-black border-transparent' : 'bg-white/5 border-white/10 text-white hover:text-white'}`}>{f} ({codeCounts[f]})</button>))}</div>
                      {sortedVipCodes.length === 0 && !vipCodesLoading && <p className="mt-3 text-sm text-white leading-relaxed">No VIP codes yet. Generate one above or approve a join request below.</p>}
                      {filteredVipCodes.length === 0 && sortedVipCodes.length > 0 && <p className="mt-3 text-sm text-white leading-relaxed">No codes in “{codeFilter}”.</p>}
                      <ul className="mt-3 space-y-2">{filteredVipCodes.map(c => { const state = expiryState(c); return (<li key={c.localId} className={`rounded-2xl border p-4 break-words ${state === 'Active' ? 'border-emerald-400 bg-emerald-500/[0.06]' : state === 'Expiring Soon' ? 'border-amber-400 bg-amber-500/[0.06]' : state === 'Expired' ? 'border-red-400 bg-red-500/[0.06]' : 'border-white/5 bg-black/20'}`}><div className="flex flex-wrap items-center justify-between gap-2"><strong className="font-mono text-sm tracking-wide break-all text-white leading-relaxed">{c.code}</strong><span className={`text-sm font-black px-3 py-2 rounded-full border break-words ${c.status === 'Revoked' ? 'bg-red-500/20 text-white border-red-400' : state === 'Active' ? 'bg-emerald-500/20 text-white border-emerald-400' : state === 'Expiring Soon' ? 'bg-amber-500/20 text-white border-amber-400' : 'bg-red-500/20 text-white border-red-400'}`}>{c.status === 'Revoked' ? 'Revoked' : state}</span></div><p className="text-sm text-white mt-2 leading-relaxed break-words">Plan: <strong className="text-white">{c.plan}</strong></p><p className="text-sm text-white leading-relaxed break-words">Created: <strong className="text-white">{c.createdAt ? new Date(c.createdAt).toLocaleString('en-GB') : '—'}</strong></p><p className="text-sm text-white leading-relaxed break-words">Expiry Date: <strong className="text-white">Expires on {formatExpiry(c.expiresAt)}</strong></p><p className="text-sm text-white leading-relaxed break-words">Days Left: <strong className="text-white">{daysLeftText(c.expiresAt)}</strong></p><p className="text-sm text-white leading-relaxed break-words">Used By: <strong className="text-white break-words">{c.usedBy || '— Not assigned yet'}</strong></p><div className="mt-3 flex flex-wrap gap-2"><a href={`https://wa.me/263776146008?text=${encodeURIComponent(`Hi! Here is your VIP code for Wayne Betting Tips: ${c.code}`)}`} target="_blank" rel="noopener" className="px-4 py-3 rounded-full bg-[#25D366]/20 border border-[#25D366]/40 text-sm font-bold inline-flex flex-wrap items-center gap-1.5 text-white break-words"><MessageCircle size={14} className="text-[#25D366]" /> Send via WhatsApp</a>{c.status === 'Active' && <button onClick={() => handleExtendCode(c)} disabled={extendingId === c.localId} className="px-4 py-3 rounded-full bg-emerald-500/20 border border-emerald-400 text-white text-sm font-bold disabled:opacity-60 break-words">{extendingId === c.localId ? 'Extending…' : '+30 days'}</button>}{c.status === 'Active' && <button onClick={() => handleRevoke(c)} disabled={revokingId === c.localId} className="px-4 py-3 rounded-full bg-red-500/20 border border-red-400 text-white text-sm font-bold disabled:opacity-60 break-words">{revokingId === c.localId ? 'Revoking…' : 'Revoke'}</button>}<button onClick={() => handleDeleteCode(c)} disabled={deletingCodeId === c.localId} className="px-4 py-3 rounded-full bg-white/5 border border-white/10 text-sm font-bold inline-flex flex-wrap items-center gap-1.5 text-white disabled:opacity-60 break-words"><Trash2 size={14} />{deletingCodeId === c.localId ? 'Deleting…' : 'Delete'}</button></div></li>); })}</ul>
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-display font-black text-lg flex flex-wrap items-center gap-2 text-white leading-relaxed"><UserCheck size={18} className="text-[#FFE9A8]" /> VIP Join Requests</h4><button onClick={reloadInquiries} disabled={inquiriesLoading} className="px-4 py-3 rounded-full bg-white/10 text-sm font-bold text-white disabled:opacity-60 break-words">{inquiriesLoading ? 'Loading…' : 'Refresh'}</button></div>
                      <p className="text-sm text-white mt-1 leading-relaxed">From the pricing / Join VIP form. Approve to generate a code automatically.</p>
                      {vipJoinRequests.length === 0 && !inquiriesLoading && <p className="mt-3 text-sm text-white leading-relaxed">No VIP join requests yet.</p>}
                      <ul className="mt-3 space-y-2">{vipJoinRequests.map(q => { const approved = approvedCodes[q.id]; return (<li key={q.id} className="rounded-2xl border border-white/5 bg-black/20 p-4 break-words"><div className="flex flex-wrap justify-between gap-2"><strong className="text-base text-white leading-relaxed">{q.name || 'Unnamed request'}</strong><span className="text-sm text-white">{q.createdAt ? new Date(q.createdAt).toLocaleString('en-GB') : ''}</span></div><p className="text-sm text-white mt-1.5 leading-relaxed break-words">Contact: <strong className="text-white break-all">{q.contact || q.email || '—'}</strong></p><p className="text-sm text-white leading-relaxed break-words">Plan: <strong className="text-white">{q.plan || '—'}</strong></p>{q.message && <p className="text-sm text-white mt-1 leading-relaxed break-words">{q.message}</p>}{approved ? (<div className="mt-3 rounded-xl bg-emerald-500/20 border border-emerald-400 p-3 break-words"><p className="text-sm font-bold text-white uppercase tracking-wide leading-relaxed">Approved — code generated</p><p className="font-mono font-black tracking-wide mt-1 break-all text-white text-sm leading-relaxed">{approved}</p></div>) : (<button onClick={() => handleApproveRequest(q)} disabled={approvingId === q.id} className={`mt-3 ${btnBase} btn-gold disabled:opacity-60`}><Check size={16} />{approvingId === q.id ? 'Generating code…' : 'Approve — Generate Code'}</button>)}</li>); })}</ul>
                    </div>
                  </div>
                </div>

                <div className="mt-6 grid lg:grid-cols-5 gap-4 items-start">
                  <div className="lg:col-span-2 glass rounded-3xl p-5 sm:p-6 break-words">
                    <h3 className="font-display font-black text-xl flex flex-wrap items-center gap-2 text-white leading-relaxed">{editingTip ? <><Pencil size={18} className="text-[#FFE9A8]" /> Edit Tip</> : <><Plus size={18} className="text-[#FFE9A8]" /> Add Tip</>}</h3><p className="text-sm text-white mt-1 leading-relaxed">{editingTip ? `Editing “${editingTip.match}”. Save to update it live.` : 'Add a tip here — it will show live to visitors.'}</p>
                    <form onSubmit={handleSaveTip} className="mt-5 grid gap-4">
                      <div className="field"><label htmlFor="tip-match">Match</label><input id="tip-match" placeholder="e.g. Arsenal vs Chelsea" value={formData.match} onChange={e => setFormData(s => ({ ...s, match: e.target.value }))} className="w-full px-4 py-3 rounded-2xl text-sm" /></div>
                      <div className="field"><label htmlFor="tip-tip">Tip</label><input id="tip-tip" placeholder="e.g. Over 2.5 Goals" value={formData.tip} onChange={e => setFormData(s => ({ ...s, tip: e.target.value }))} className="w-full px-4 py-3 rounded-2xl text-sm" /></div>
                      <div className="field"><label htmlFor="tip-odds">Odds e.g. 1.85</label><input id="tip-odds" placeholder="1.85" inputMode="decimal" value={formData.odds} onChange={e => setFormData(s => ({ ...s, odds: e.target.value }))} className="w-full px-4 py-3 rounded-2xl text-sm" /></div>
                      <p className="text-sm text-white leading-relaxed">Odds are optional but recommended — they show as <span className="font-bold text-[#FFE9A8]">@ 1.85</span> on Free, VIP and History tips.</p>
                      <div className="grid sm:grid-cols-2 gap-4"><div><label className="text-sm font-bold uppercase tracking-wide text-white block mb-1.5 leading-relaxed" htmlFor="tip-date">Date</label><input id="tip-date" type="date" value={formData.date} onChange={e => setFormData(s => ({ ...s, date: e.target.value }))} className="w-full px-4 py-3 rounded-full text-sm" /></div><div><label className="text-sm font-bold uppercase tracking-wide text-white block mb-1.5 leading-relaxed" htmlFor="tip-kickoff">Kick-Off Time *</label><input id="tip-kickoff" type="time" value={formData.kickoff} onChange={e => setFormData(s => ({ ...s, kickoff: e.target.value }))} className="w-full px-4 py-3 rounded-full text-sm" required /></div></div>
                      <div><span className="text-sm font-bold uppercase tracking-wide text-white block mb-1.5 leading-relaxed">Type</span><div className="grid grid-cols-2 gap-2" role="group" aria-label="Tip type">{(['Free', 'VIP'] as TipType[]).map(t => (<button key={t} type="button" onClick={() => setFormData(s => ({ ...s, type: t }))} aria-pressed={formData.type === t} className={`px-4 py-3 rounded-full text-sm font-bold border break-words leading-relaxed ${formData.type === t ? 'bg-gradient-to-r from-[#FFF0B8] to-[#C9A24B] text-black border-transparent' : 'bg-white/5 border-white/10 text-white'}`}>{t === 'Free' ? 'Free Tip' : 'VIP Tip'}</button>))}</div></div>
                      <div><span className="text-sm font-bold uppercase tracking-wide text-white block mb-1.5 leading-relaxed">Result</span><div className="grid grid-cols-3 gap-2" role="group" aria-label="Tip result">{(['Pending', 'Won', 'Lost'] as TipResult[]).map(r => (<button key={r} type="button" onClick={() => setFormData(s => ({ ...s, result: r }))} aria-pressed={formData.result === r} className={`px-4 py-3 rounded-full text-sm font-bold border break-words leading-relaxed ${formData.result === r ? (r === 'Won' ? 'bg-emerald-500 text-black border-emerald-500' : r === 'Lost' ? 'bg-red-500 text-white border-red-500' : 'bg-gradient-to-r from-[#FFF0B8] to-[#C9A24B] text-black border-transparent') : 'bg-white/5 border-white/10 text-white'}`}>{r}</button>))}</div><p className="text-sm text-white mt-1.5 leading-relaxed">Pending stays in current tips. Won / Lost moves it to History.</p></div>
                      {formError && <p className="text-sm text-white bg-amber-500/20 border border-amber-400 rounded-2xl px-4 py-3 leading-relaxed break-words">{formError}</p>}
                      {notice && <p className="text-sm text-white bg-emerald-500/20 border border-emerald-400 rounded-2xl px-4 py-3 flex gap-2 leading-relaxed break-words"><Check size={16} className="shrink-0 mt-0.5" />{notice}</p>}
                      <div className="flex flex-wrap gap-2"><button type="submit" disabled={adding} className={`btn-gold flex-1 min-w-[160px] ${btnBase} disabled:opacity-60`}><Plus size={16} />{adding ? 'Saving…' : editingTip ? 'Save Changes' : `Add ${formData.type} Tip`}</button>{editingTip && <button type="button" onClick={cancelEdit} className={`${btnBase} border border-white/10 bg-white/5 text-white`}>Cancel Edit</button>}</div>
                      <p className="text-sm text-white leading-relaxed">Free tips appear in Free Tips. VIP tips appear in the VIP preview. Settled tips appear in History.</p>
                    </form>
                  </div>
                  <div className="lg:col-span-3 glass rounded-3xl p-5 sm:p-6 break-words min-w-0">
                    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-display font-black text-xl text-white leading-relaxed">Manage Tips &amp; History</h3><span className="text-sm text-white leading-relaxed break-words">{tips.length} total • {freeTips.length} Free • {vipTips.length} VIP • {historyStats.total} in History</span></div>
                    {tips.length === 0 ? (<p className="mt-4 text-sm text-white leading-relaxed">No tips yet. Use the Add Tip form to add your first tip.</p>) : (<div className="overflow-x-auto mt-4"><ul className="min-w-[520px] divide-y divide-white/5 border border-white/5 rounded-2xl bg-black/20">{tips.map(t => (<li key={t.localId} className="px-4 py-4 break-words"><div className="flex flex-wrap items-center gap-2"><span className={`text-sm font-black px-3 py-2 rounded-full break-words ${t.type === 'VIP' ? 'bg-[#FFE9A8] text-black' : 'bg-white/10 text-white'}`}>{t.type}</span><span className={`inline-flex flex-wrap items-center gap-1 px-3 py-2 rounded-full border text-sm font-black break-words ${resultBadgeClass(t.result)}`}>{t.result.toUpperCase()}</span><p className="text-base leading-relaxed flex-1 min-w-[180px] break-words"><span className="inline-flex flex-wrap items-center gap-1.5 font-black text-[#FFE9A8]"><Clock size={16} className="text-[#FFE9A8]" />{formatKickoff(t.kickoff) || '—'}</span><span className="text-white mx-2">-</span><span className="font-bold text-white">Match: {t.match}</span><span className="text-white"> — </span><span className="font-semibold text-[#FFE9A8]">Tip: {t.tip}</span>{formatOdds(t.odds) && <span className="ml-2 inline-flex flex-wrap items-center px-3 py-2 rounded-full border border-[var(--border-strong)] bg-[#FFE9A8]/10 text-base font-black text-[#FFE9A8] break-words">Odds {formatOdds(t.odds)}</span>}{t.date && <span className="block text-sm text-white">{formatDate(t.date)} • Kick-off {formatKickoff(t.kickoff) || '—'}</span>}</p></div><div className="mt-2.5 flex flex-wrap gap-2"><button onClick={() => updateTipResult(t, 'Won')} disabled={resultBusy === t.localId || t.result === 'Won'} className="px-4 py-3 rounded-full bg-emerald-500/20 border border-emerald-400 text-white text-sm font-bold flex flex-wrap items-center gap-1 disabled:opacity-50 break-words"><CheckCircle2 size={14} /> Mark Won</button><button onClick={() => updateTipResult(t, 'Lost')} disabled={resultBusy === t.localId || t.result === 'Lost'} className="px-4 py-3 rounded-full bg-red-500/20 border border-red-400 text-white text-sm font-bold flex flex-wrap items-center gap-1 disabled:opacity-50 break-words"><XCircle size={14} /> Mark Lost</button><button onClick={() => startEdit(t)} className="px-4 py-3 rounded-full bg-white/10 text-sm font-bold text-white flex flex-wrap items-center gap-1 break-words"><Pencil size={14} /> Edit</button><button onClick={() => deleteTip(t)} className="px-4 py-3 rounded-full text-white flex flex-wrap items-center gap-1 text-sm font-bold break-words" aria-label={`Delete tip ${t.match}`}><Trash2 size={14} /> Delete</button></div></li>))}</ul></div>)}
                    {historyError && <p className="mt-3 text-sm text-white bg-amber-500/20 border border-amber-400 rounded-2xl px-4 py-3 leading-relaxed break-words">{historyError}</p>}
                    <div className="mt-6"><div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-display font-black text-lg flex flex-wrap items-center gap-2 text-white leading-relaxed"><Inbox size={18} className="text-[#FFE9A8]" /> Inquiries</h4><button onClick={reloadInquiries} disabled={inquiriesLoading} className="px-4 py-3 rounded-full bg-white/10 text-sm font-bold text-white disabled:opacity-60 break-words">{inquiriesLoading ? 'Loading…' : 'Refresh'}</button></div><p className="text-sm text-white mt-1 leading-relaxed">Messages sent through the Contact form.</p>{inquiriesError && <p className="mt-3 text-sm text-white bg-amber-500/20 border border-amber-400 rounded-2xl px-4 py-3 leading-relaxed break-words">{inquiriesError}</p>}{inquiries.length === 0 && !inquiriesLoading && !inquiriesError && <p className="mt-3 text-sm text-white leading-relaxed">No inquiries yet.</p>}<ul className="mt-3 space-y-3">{inquiries.map(q => (<li key={q.id} className="rounded-2xl border border-white/5 bg-black/20 p-4 break-words"><div className="flex flex-wrap justify-between gap-2"><strong className="text-base text-white leading-relaxed">{q.name}</strong>{q.email ? <a href={`mailto:${q.email}`} className="text-sm font-bold text-[#FFE9A8] underline underline-offset-2 break-all">{q.email}</a> : null}</div>{q.kind === 'vip_join' && <span className="inline-flex flex-wrap mt-2 items-center gap-1.5 bg-[#FFE9A8] text-black text-sm font-black tracking-wide px-3 py-2 rounded-full break-words"><Crown size={14} /> VIP JOIN REQUEST{q.plan ? ` — ${q.plan}` : ''}</span>}{q.contact && <p className="text-sm text-white mt-2 leading-relaxed break-words">Contact: <strong className="text-white break-all">{q.contact}</strong></p>}<p className="text-sm leading-relaxed text-white mt-2 break-words">{q.message}</p>{q.proofNote && <p className="text-sm text-white mt-1 leading-relaxed break-words">Proof note: {q.proofNote}</p>}{q.createdAt && <p className="text-sm text-white mt-2 leading-relaxed">{new Date(q.createdAt).toLocaleString('en-GB')}</p>}</li>))}</ul></div>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}
      </main>

      {joinPlan && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-sm" onClick={closeJoin} role="presentation">
          <div role="dialog" aria-modal="true" aria-label={`Join ${joinPlan}`} className="glass w-full max-w-[560px] max-h-[92vh] overflow-y-auto rounded-t-[28px] sm:rounded-[28px] p-5 sm:p-7 bg-[#101914] break-words">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm tracking-wide uppercase font-bold text-[#FFE9A8] flex flex-wrap items-center gap-1.5 leading-relaxed"><Crown size={16} /> Join VIP</p>
                <h3 className="font-display font-black text-xl sm:text-2xl leading-tight mt-2 text-white break-words">Plan selected: {joinPlan === 'VIP Monthly' ? 'VIP Monthly - $19/mo' : 'VIP Yearly - $149/yr'}</h3>
                {joinPlan === 'VIP Yearly' && <span className="inline-flex flex-wrap mt-2 bg-emerald-500 text-black text-sm tracking-wide font-black px-4 py-2 rounded-full break-words">SAVE 35% — BEST VALUE</span>}
              </div>
              <button onClick={closeJoin} aria-label="Close Join VIP" className="w-11 h-11 shrink-0 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white text-base font-bold">×</button>
            </div>
            <ol className="mt-5 space-y-3">
              {[{ n: '1', t: 'Send payment', d: 'Choose a payment option below.' }, { n: '2', t: 'Send proof to email', d: 'Use the form below, or email Wayne directly.' }, { n: '3', t: 'Get added to VIP', d: 'Wayne confirms your payment and adds you.' }].map(s => (
                <li key={s.n} className="flex gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 break-words"><span className="w-8 h-8 shrink-0 rounded-full bg-gradient-to-br from-[#FFF0B8] to-[#C9A24B] text-black font-black text-sm flex items-center justify-center">{s.n}</span><span className="min-w-0"><strong className="block text-base text-white leading-relaxed">{s.t}</strong><span className="block text-sm text-white mt-0.5 leading-relaxed">{s.d}</span></span></li>
              ))}
            </ol>
            <p className="mt-5 text-sm font-bold uppercase tracking-wide text-white leading-relaxed">Payment options</p>
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2" role="group" aria-label="Payment method">
              {['EcoCash', 'InnBucks', 'Bank Transfer'].map(m => (
                <button key={m} type="button" onClick={() => setPaymentMethod(m)} aria-pressed={paymentMethod === m} className={`px-4 py-3 rounded-full border text-sm font-bold break-words leading-relaxed ${paymentMethod === m ? 'bg-gradient-to-r from-[#FFF0B8] to-[#C9A24B] text-black border-transparent' : 'bg-white/5 border-white/10 text-white hover:text-white'}`}><Wallet size={16} className="inline mr-1.5" />{m}</button>
              ))}
            </div>
            <p className="mt-2 text-sm text-white flex flex-wrap gap-1.5 leading-relaxed break-words"><Info size={16} className="shrink-0 mt-0.5 text-[#FFE9A8]" /> Contact Wayne for payment details. Selected: <strong className="text-white">{paymentMethod}</strong></p>
            <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-4 space-y-1.5 text-sm leading-relaxed break-words">
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 break-words"><span className="text-white">Email:</span><a href="mailto:tadiwagombakomba35@gmail.com" className="font-bold text-[#FFE9A8] break-all">tadiwagombakomba35@gmail.com</a></p>
            </div>
            {joinStatus === 'sent' ? (
              <div className="mt-5 rounded-2xl bg-emerald-500/20 border border-emerald-400 p-4 break-words">
                <p className="font-bold text-white flex flex-wrap items-center gap-2 text-sm leading-relaxed"><CheckCircle2 size={18} /> Request sent! Wayne will contact you from tadiwagombakomba35@gmail.com</p>
                <p className="text-sm text-white mt-2 leading-relaxed break-words">Plan: {joinPlan === 'VIP Monthly' ? 'VIP Monthly - $19/mo' : 'VIP Yearly - $149/yr'} • Payment: {paymentMethod} • Name: {joinForm.name}</p>
                <button onClick={closeJoin} className={`btn-gold mt-4 ${btnBase}`}>Done</button>
              </div>
            ) : (
              <form onSubmit={handleJoinSubmit} className="mt-5 space-y-3">
                <div className="field"><label htmlFor="join-name">Name</label><input id="join-name" placeholder="Your full name" value={joinForm.name} onChange={e => setJoinForm(s => ({ ...s, name: e.target.value }))} className="w-full px-4 py-3 rounded-2xl text-sm" required /></div>
                <div className="field"><label htmlFor="join-contact">Phone / Email</label><input id="join-contact" placeholder="Phone or email" value={joinForm.contact} onChange={e => setJoinForm(s => ({ ...s, contact: e.target.value }))} className="w-full px-4 py-3 rounded-2xl text-sm" required /></div>
                <div className="field"><label htmlFor="join-proof">Proof note</label><textarea id="join-proof" placeholder="Add your payment proof note" value={joinForm.proofNote} onChange={e => setJoinForm(s => ({ ...s, proofNote: e.target.value }))} rows={3} className="w-full px-4 py-4 rounded-2xl text-sm resize-none" /></div>
                {joinError && <p className="text-sm text-white bg-amber-500/20 border border-amber-400 rounded-2xl px-4 py-3 leading-relaxed break-words">{joinError}</p>}
                <button type="submit" disabled={joinStatus === 'sending'} className={`btn-gold shine w-full ${btnBase} disabled:opacity-60`}>{joinStatus === 'sending' ? 'Sending request…' : 'Send VIP request'}</button>
                <div className="grid sm:grid-cols-2 gap-2">
                  <a href={`mailto:tadiwagombakomba35@gmail.com?subject=${encodeURIComponent(joinPlan === 'VIP Monthly' ? 'Join VIP Monthly $19' : 'Join VIP Yearly $149')}&body=${encodeURIComponent(`Hi Wayne, I want to join ${joinPlan === 'VIP Monthly' ? 'VIP Monthly - $19/mo' : 'VIP Yearly - $149/yr'} using ${paymentMethod}. Please send payment details.`)}`} className={`${btnBase} bg-white/5 border border-white/10 text-white`}><Mail size={16} /> Email Wayne to Join</a>
                  <a href="https://wa.me/263776146008?text=Hi%20Wayne%2C%20I%20want%20to%20join%20VIP%20Betting%20Tips" target="_blank" rel="noopener" className={`${btnBase} bg-[#25D366]/20 border border-[#25D366]/40 text-white`}><MessageCircle size={16} className="shrink-0 text-[#25D366]" /> WhatsApp Wayne</a>
                </div>
                <p className="text-sm text-center text-white leading-relaxed">Your request is saved so Wayne can see it in Admin.</p>
              </form>
            )}
          </div>
        </div>
      )}

      <footer className="relative z-10 border-t border-white/5 bg-[#07100C]/90 backdrop-blur break-words">
        <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 py-10">
          <div className="flex flex-wrap justify-between gap-8"><div className="max-w-[360px] min-w-0"><div className="flex flex-wrap items-center gap-2 overflow-visible"><span className="w-8 h-8 rounded-full border-2 border-[#D4AF6A] overflow-hidden flex items-center justify-center bg-[#0A0F0D] shrink-0"><img src={appIconUrl} alt="Wayne Betting Tips app icon" className="w-full h-full object-cover" /></span><span className="logo-lockup font-black text-base"><span className="logo-line text-white">WAYNE</span><span className="logo-line"><span className="gold-text">BETTING TIPS</span></span></span></div><p className="text-sm leading-relaxed text-white mt-3">Daily tips, Verified Results, and responsible betting guidance — updated every day.</p><p className="mt-3 text-sm text-white leading-relaxed break-words">Email: <a href="mailto:tadiwagombakomba35@gmail.com" className="font-bold text-[#FFE9A8] underline underline-offset-2 break-all">tadiwagombakomba35@gmail.com</a></p><div className="flex flex-wrap gap-2 mt-4"><span className="w-10 h-10 rounded-full border-2 border-[#D4AF6A] text-[#FFE9A8] flex items-center justify-center font-black text-sm">18+</span><span className="inline-flex flex-wrap items-center gap-1.5 px-4 py-3 rounded-full bg-white/5 border border-[var(--border)] text-sm font-bold text-[#FFE9A8] leading-relaxed"><BadgeCheck size={16} className="text-emerald-400" /> Gamble Responsibly</span><a href="https://wa.me/263776146008?text=Hi%20Wayne%2C%20I%20want%20to%20join%20VIP%20Betting%20Tips" target="_blank" rel="noopener" aria-label="Chat on WhatsApp" title="Chat on WhatsApp" className="w-11 h-11 rounded-full bg-[#25D366]/20 border border-[#25D366]/40 flex items-center justify-center"><MessageCircle size={18} className="text-[#25D366]" /></a></div></div>
            <nav className="grid grid-cols-2 sm:grid-cols-3 gap-8 text-sm"><div><p className="font-bold text-sm tracking-wide uppercase mb-3 text-[#FFE9A8] leading-relaxed">Windows</p><ul className="space-y-2 text-white"><li><button onClick={() => goTo('home')} className="hover:text-white text-sm font-semibold px-2 py-2">Home</button></li><li><button onClick={() => goTo('free')} className="hover:text-white text-sm font-semibold px-2 py-2">Free Tips</button></li><li><button onClick={() => goTo('vip')} className="hover:text-white text-sm font-semibold px-2 py-2">VIP Tips</button></li><li><button onClick={() => goTo('history')} className="hover:text-white text-sm font-semibold px-2 py-2">History</button></li></ul></div><div><p className="font-bold text-sm tracking-wide uppercase mb-3 text-[#FFE9A8] leading-relaxed">Learn</p><ul className="space-y-2 text-white"><li><button onClick={() => goTo('vip')} className="hover:text-white text-sm font-semibold px-2 py-2">Pricing</button></li><li><button onClick={() => goTo('contact')} className="hover:text-white text-sm font-semibold px-2 py-2">Contact Us</button></li></ul></div><div><p className="font-bold text-sm tracking-wide uppercase mb-3 text-[#FFE9A8] leading-relaxed">Support</p><ul className="space-y-2 text-white"><li><span className="text-sm">BeGambleAware.org</span></li><li><span className="text-sm">18+ only</span></li><li><span className="text-sm">Play responsibly</span></li></ul></div></nav></div>
          <div className="mt-10 pt-6 border-t border-white/5 text-sm leading-relaxed text-white"><p className="break-words"><strong className="text-[#FFE9A8]">18+ | Gamble Responsibly | BeGambleAware.org | Betting involves risk, please bet responsibly</strong></p><p className="mt-3 break-words">There are no guaranteed wins. Betting involves risk and can be addictive — never bet more than you can afford to lose. If gambling stops being fun, take a break and seek support from BeGambleAware.org. 18+ only.</p><p className="mt-3 flex flex-wrap justify-between gap-2"><span>© {new Date().getFullYear()} Wayne Betting Tips. All rights reserved.</span><span>{loading ? 'Loading… • ' : ''}<button type="button" onClick={handleKeyClick} className="cursor-pointer bg-transparent border-0 p-1 -m-1 text-inherit leading-[inherit]">Updated Daily</button></span></p></div>
        </div>
      </footer>
    </div>
  );
}

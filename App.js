import { useEffect, useState } from 'react';
import {
  SafeAreaView, View, Text, TextInput, TouchableOpacity, FlatList, Image,
  ScrollView, StyleSheet, StatusBar, Modal, KeyboardAvoidingView, Platform, Alert, BackHandler,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, today, calcAge, login, setCurrentRole } from './api';

const COLORS = {
  bg: '#0F1F2E', surface: '#16304A', surface2: '#1D3D5C', surface3: '#26507A',
  text: '#F2F6FA', muted: '#9FB4C7', border: 'rgba(242,246,250,0.10)',
};
const ACCENT = '#3DA9FC';

const STATUTS = [
  { key: 'disponible', label: 'Disponible', short: 'Disponible', color: '#52D17C', sing: 'disponible', plur: 'disponibles' },
  { key: 'disponible_adaptation', label: 'Disponible avec adaptation', short: 'Adapté', color: '#A9D14E', sing: 'disponible (adaptation)', plur: 'disponibles (adaptation)' },
  { key: 'a_surveiller', label: 'À surveiller', short: 'Surveillance', color: '#FFB020', sing: 'à surveiller', plur: 'à surveiller' },
  { key: 'attente_bilan', label: 'Attente bilan', short: 'Bilan', color: '#F5B942', sing: 'en attente de bilan', plur: 'en attente de bilan' },
  { key: 'protocole_commotion', label: 'Protocole commotion', short: 'Commotion', color: '#F2994A', sing: 'en protocole commotion', plur: 'en protocole commotion' },
  { key: 'retour_terrain', label: 'Retour terrain', short: 'Retour', color: '#56C2E0', sing: 'en retour terrain', plur: 'en retour terrain' },
  { key: 'suspendu', label: 'Suspendu', short: 'Suspendu', color: '#9B7EDE', sing: 'suspendu', plur: 'suspendus' },
  { key: 'indisponible', label: 'Indisponible', short: 'Indispo', color: '#F0654A', sing: 'indisponible', plur: 'indisponibles' },
];
const PRIORITY_ORDER = STATUTS.map((s) => s.key);
const statutInfo = (key) => STATUTS.find((s) => s.key === key) || STATUTS[0];
const STATUS_ICON = {
  disponible: '✓', disponible_adaptation: '~', a_surveiller: '👁', attente_bilan: '?', protocole_commotion: '⚠',
  retour_terrain: '↻', suspendu: '■', indisponible: '✕',
};
const initials = (name) => name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

const PHASES = [
  { key: 'blessure', label: 'Blessure', color: '#F0654A' },
  { key: 'soins', label: 'Soins', color: '#F0654A' },
  { key: 'reathle', label: 'Réathlé', color: '#F5B942' },
  { key: 'terrain', label: 'Terrain', color: '#F5B942' },
  { key: 'contact', label: 'Contact', color: '#56C2E0' },
  { key: 'match', label: 'Match', color: '#52D17C' },
];
const phaseIndex = (key) => { const i = PHASES.findIndex((p) => p.key === key); return i === -1 ? 0 : i; };

function PhaseTrack({ current }) {
  const idx = phaseIndex(current);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
      {PHASES.map((p, i) => (
        <View key={p.key} style={{ flexDirection: 'row', alignItems: 'center', flex: i < PHASES.length - 1 ? 1 : 0 }}>
          <View style={[
            styles.phaseDot,
            i < idx && { backgroundColor: '#52D17C', borderColor: '#52D17C' },
            i === idx && { backgroundColor: p.color, borderColor: p.color },
          ]}>
            {i < idx && <Text style={{ color: '#0F1F2E', fontSize: 9, fontWeight: '800' }}>✓</Text>}
          </View>
          {i < PHASES.length - 1 && <View style={[styles.phaseLine, i < idx && { backgroundColor: '#52D17C' }]} />}
        </View>
      ))}
    </View>
  );
}

// Parse une date au format JJ/MM/AAAA ou JJ/MM/AA. Retourne null si invalide.
function parseDateFR(str) {
  if (!str) return null;
  const m = String(str).match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  let [, d, mo, y] = m;
  if (y.length === 2) y = '20' + y;
  const dt = new Date(Number(y), Number(mo) - 1, Number(d));
  return isNaN(dt.getTime()) ? null : dt;
}
// Trie une liste par date desc (plus récente en premier). Entrées sans date valable en dernier.
function sortByDateDesc(list, getDate) {
  return [...list].sort((a, b) => {
    const da = parseDateFR(getDate(a));
    const db = parseDateFR(getDate(b));
    if (!da && !db) return 0;
    if (!da) return 1;
    if (!db) return -1;
    return db - da;
  });
}
function blessureLabel(b) {
  return [b.zone || 'Blessure', b.cote && b.cote !== 'Non concerné' ? `(${b.cote})` : null].filter(Boolean).join(' ');
}
function daysSince(dateStr) {
  const d = parseDateFR(dateStr);
  if (!d) return null;
  const diff = Math.floor((new Date().setHours(0, 0, 0, 0) - d.setHours(0, 0, 0, 0)) / 86400000);
  return diff >= 0 ? diff : null;
}

function Avatar({ player, size = 36 }) {
  if (player.photo) {
    return <Image source={{ uri: player.photo }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  }
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: COLORS.surface3, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontWeight: '800', fontSize: size * 0.36, color: COLORS.text }}>{initials(player.name)}</Text>
    </View>
  );
}

function TeamLogo({ uri, size = 26 }) {
  if (!uri) return <View style={{ width: size, height: size, borderRadius: 4, backgroundColor: COLORS.surface3 }} />;
  return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: 4 }} resizeMode="contain" />;
}

function matchLabel(m) {
  if (m.equipeDomicile || m.equipeExterieur) return `${m.equipeDomicile || '?'} - ${m.equipeExterieur || '?'}`;
  return m.titre || 'Match';
}

function MatchRow({ m, onPress, onEdit, onDelete }) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress}>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TeamLogo uri={m.logoDomicile} />
          <Text style={{ fontWeight: '700', fontSize: 14, color: COLORS.text, flexShrink: 1 }} numberOfLines={1}>{matchLabel(m)}</Text>
          <TeamLogo uri={m.logoExterieur} />
        </View>
        <Text style={{ fontSize: 11, color: COLORS.muted, marginTop: 5 }}>
          {[m.date, m.heure, m.typeMatch].filter(Boolean).join(' · ')}
        </Text>
      </View>
      {!!onEdit && (
        <TouchableOpacity onPress={onEdit} style={{ padding: 6 }}>
          <Text style={{ color: COLORS.muted, fontSize: 16 }}>✎</Text>
        </TouchableOpacity>
      )}
      {!!onDelete && (
        <TouchableOpacity onPress={onDelete} style={{ padding: 6 }}>
          <Text style={{ color: '#F0654A', fontSize: 16 }}>🗑</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

function StatusBadge({ status, onPress, editable = true }) {
  const s = statutInfo(status);
  return (
    <TouchableOpacity onPress={editable ? onPress : undefined} disabled={!editable} style={[styles.statusBadge, { borderColor: s.color, backgroundColor: s.color + '22' }]}>
      <View style={[styles.dot, { backgroundColor: s.color }]} />
      <Text style={{ color: s.color, fontWeight: '700', fontSize: 13 }}>{s.label}</Text>
      {editable && <Text style={{ color: s.color, fontSize: 11, marginLeft: 4 }}>▾</Text>}
    </TouchableOpacity>
  );
}

function StatusPickerModal({ visible, current, onSelect, onClose, subtitle }) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.sheetOverlay}>
        <View style={styles.sheet}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: subtitle ? 6 : 14 }}>
            <Text style={styles.heading}>STATUT</Text>
            <TouchableOpacity onPress={onClose}><Text style={{ color: COLORS.muted, fontSize: 24, padding: 4 }}>✕</Text></TouchableOpacity>
          </View>
          {!!subtitle && <Text style={{ color: COLORS.muted, fontSize: 12, marginBottom: 14 }}>{subtitle}</Text>}
          <ScrollView>
            {STATUTS.map((s) => (
              <TouchableOpacity
                key={s.key}
                onPress={() => onSelect(s.key)}
                style={[styles.statusRow2, current === s.key && { borderColor: s.color, backgroundColor: s.color + '18' }]}
              >
                <View style={[styles.dot, { backgroundColor: s.color }]} />
                <Text style={{ color: current === s.key ? s.color : COLORS.text, fontWeight: current === s.key ? '700' : '500', fontSize: 14 }}>{s.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function InfoField({ label, value, onSave, keyboardType, multiline, readOnly }) {
  const [val, setVal] = useState(value || '');
  useEffect(() => { setVal(value || ''); }, [value]);
  if (readOnly) {
    return (
      <View style={{ marginBottom: 12 }}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <Text style={[styles.fieldInput, { color: COLORS.text }]}>{value || '—'}</Text>
      </View>
    );
  }
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.fieldInput, multiline && { height: 70, textAlignVertical: 'top' }]}
        value={val}
        onChangeText={setVal}
        onEndEditing={() => { if (val !== (value || '')) onSave(val); }}
        keyboardType={keyboardType || 'default'}
        multiline={multiline}
        placeholder="—"
        placeholderTextColor={COLORS.muted}
      />
    </View>
  );
}

function SummaryListModal({ visible, statut, players, onOpenPlayer, onClose }) {
  if (!statut) return null;
  const list = players.filter((p) => p.status === statut.key);
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.sheetOverlay}>
        <View style={[styles.sheet, { maxHeight: '70%' }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={[styles.dot, { backgroundColor: statut.color }]} />
              <Text style={styles.heading}>{statut.label.toUpperCase()}</Text>
            </View>
            <TouchableOpacity onPress={onClose}><Text style={{ color: COLORS.muted, fontSize: 24, padding: 4 }}>✕</Text></TouchableOpacity>
          </View>
          <ScrollView>
            {list.length === 0 && <Text style={styles.empty}>Aucun joueur dans ce statut.</Text>}
            {list.map((p) => (
              <TouchableOpacity key={p.id} style={styles.card} onPress={() => onOpenPlayer(p.id)}>
                <Avatar player={p} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '700', fontSize: 15, color: COLORS.text }}>{p.name}</Text>
                  {!!p.poste && <Text style={{ fontSize: 11, color: COLORS.muted }}>{p.poste}</Text>}
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const ROLES = [
  { key: 'soigneur', label: 'Soigneur' },
  { key: 'medecin', label: 'Médecin' },
  { key: 'osteopathe', label: 'Ostéopathe' },
  { key: 'kine', label: 'Kiné' },
  { key: 'preparateur', label: 'Préparateur physique' },
  { key: 'entraineur', label: 'Entraîneur' },
  { key: 'manager', label: 'Manager' },
  { key: 'joueur', label: 'Joueur' },
  { key: 'administrateur', label: 'Administrateur' },
];

const MECANISMES = ['Plaquage', 'Mêlée', 'Course', 'Musculation', 'Rucks', 'Maul', 'Réception', 'Accélération', 'Contact', 'Autres'];
const COTES = ['Gauche', 'Droit', 'Non concerné'];
const ZONES = ['Crâne', 'Cervicales', 'Épaule/Clavicule', 'Bras', 'Avant-bras', 'Coude', 'Poignet', 'Main/Doigt', 'Thorax/Côtes', 'Dos', 'Abdomen', 'Hanche', 'Cuisse', 'Genou', 'Mollet', 'Cheville', 'Pied/Orteil'];
const DIAGNOSTICS = ['Entorse', 'Élongation', 'Déchirure musculaire', 'Contusion', 'Fracture', 'Luxation', 'Tendinite', 'Rupture ligamentaire', 'Rupture tendineuse', 'Plaie', 'Autre'];
const SYMPTOMES = ['Douleurs', 'Gonflement', 'Hématome', 'Instabilité', 'Perte de force', 'Limitation articulaire', 'Fourmillements', 'Engourdissement', 'Craquement', 'Déformation', 'Autres'];
const CONTEXTES = ['Échauffement', 'Entraînement', 'Match'];
const BLESSURE_EDIT_ROLES = ['soigneur', 'osteopathe', 'kine', 'administrateur'];
const BLESSURE_COMMENT_ROLES = ['medecin'];
const STATUS_CHOICE_ROLES = ['soigneur', 'administrateur'];
const PLAYER_EDIT_ROLES = ['soigneur', 'administrateur'];
const SOIN_TYPES = ['Strap', 'Massage', 'Manipulation'];

function generateSlots(startHour, startMinute, endHour, endMinute, step) {
  const slots = [];
  let h = startHour, m = startMinute;
  while (h < endHour || (h === endHour && m <= endMinute)) {
    slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    m += step;
    if (m >= 60) { m -= 60; h += 1; }
  }
  return slots;
}
const MATCH_SLOTS = generateSlots(13, 30, 16, 0, 5);

// Formate une saisie de chiffres en JJ/MM/AAAA au fur et à mesure de la frappe
function formatDateInput(raw) {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return digits.slice(0, 2) + '/' + digits.slice(2);
  return digits.slice(0, 2) + '/' + digits.slice(2, 4) + '/' + digits.slice(4);
}

function Chip({ label, active, onPress }) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={{ color: active ? '#0F1F2E' : COLORS.text, fontWeight: '700', fontSize: 12 }}>{label}</Text>
    </TouchableOpacity>
  );
}

function BlessureFormModal({ visible, onClose, onSave, initial, role, currentPlayerStatus }) {
  const isEdit = !!initial;
  const [date, setDate] = useState('');
  const [zone, setZone] = useState('');
  const [zoneRemarque, setZoneRemarque] = useState('');
  const [cote, setCote] = useState('');
  const [diagnostic, setDiagnostic] = useState('');
  const [diagnosticAutre, setDiagnosticAutre] = useState('');
  const [diagnosticRemarque, setDiagnosticRemarque] = useState('');
  const [mecanisme, setMecanisme] = useState('');
  const [mecanismeAutre, setMecanismeAutre] = useState('');
  const [mecanismeRemarque, setMecanismeRemarque] = useState('');
  const [imagerie, setImagerie] = useState(false);
  const [imagerieDate, setImagerieDate] = useState('');
  const [rdvMedecin, setRdvMedecin] = useState(false);
  const [rdvMedecinDate, setRdvMedecinDate] = useState('');
  const [contexte, setContexte] = useState('');
  const [matchMinute, setMatchMinute] = useState('');
  const [douleur, setDouleur] = useState('');
  const [suspicionCommotion, setSuspicionCommotion] = useState(false);
  const [symptomes, setSymptomes] = useState([]);
  const [symptomesAutre, setSymptomesAutre] = useState('');
  const [newStatus, setNewStatus] = useState('indisponible');

  useEffect(() => {
    if (visible) {
      const isKnownDiagnostic = initial && DIAGNOSTICS.includes(initial.diagnostic);
      setDate(initial?.date || '');
      setZone(initial?.zone || '');
      setZoneRemarque(initial?.zoneRemarque || '');
      setCote(initial?.cote || '');
      setDiagnostic(initial ? (isKnownDiagnostic ? initial.diagnostic : (initial.diagnostic ? 'Autre' : '')) : '');
      setDiagnosticAutre(initial && !isKnownDiagnostic ? (initial.diagnostic || '') : '');
      setDiagnosticRemarque(initial?.diagnosticRemarque || '');
      setMecanisme(initial ? (initial.mecanisme && MECANISMES.includes(initial.mecanisme) ? initial.mecanisme : (initial.mecanisme ? 'Autres' : '')) : '');
      setMecanismeAutre(initial && initial.mecanisme && !MECANISMES.includes(initial.mecanisme) ? initial.mecanisme : '');
      setMecanismeRemarque(initial?.mecanismeRemarque || '');
      setImagerie(!!initial?.imagerie);
      setImagerieDate(initial?.imagerieDate || '');
      setRdvMedecin(!!initial?.rdvMedecin);
      setRdvMedecinDate(initial?.rdvMedecinDate || '');
      setContexte(initial?.contexte || '');
      setMatchMinute(initial?.matchMinute || '');
      setDouleur(initial?.douleur || '');
      setSuspicionCommotion(!!initial?.suspicionCommotion);
      setSymptomes(initial?.symptomes ? initial.symptomes.split(', ').filter(Boolean) : []);
      setSymptomesAutre(initial?.symptomesAutre || '');
      setNewStatus(initial ? (currentPlayerStatus || 'indisponible') : 'indisponible');
    }
  }, [visible, initial]);

  const reset = () => { setDate(''); setZone(''); setZoneRemarque(''); setCote(''); setDiagnostic(''); setDiagnosticAutre(''); setDiagnosticRemarque(''); setMecanisme(''); setMecanismeAutre(''); setMecanismeRemarque(''); setImagerie(false); setImagerieDate(''); setContexte(''); setMatchMinute(''); setDouleur(''); setSuspicionCommotion(false); setSymptomes([]); setSymptomesAutre(''); setRdvMedecin(false); setRdvMedecinDate(''); setNewStatus('indisponible'); };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.sheetOverlay}>
        <KeyboardAvoidingView style={[styles.sheet, { maxHeight: '88%' }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 }}>
            <Text style={styles.heading}>{isEdit ? 'MODIFIER LA BLESSURE' : 'NOUVELLE BLESSURE'}</Text>
            <TouchableOpacity onPress={() => { reset(); onClose(); }}><Text style={{ color: COLORS.muted, fontSize: 24, padding: 4 }}>✕</Text></TouchableOpacity>
          </View>
          <ScrollView>
            <Text style={styles.fieldLabel}>Date (JJ/MM/AAAA)</Text>
            <TextInput style={[styles.field, { marginBottom: 12 }]} value={date} onChangeText={(t) => setDate(formatDateInput(t))} placeholder="—" placeholderTextColor={COLORS.muted} keyboardType="number-pad" maxLength={10} />

            <Text style={styles.fieldLabel}>Contexte</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              {CONTEXTES.map((c) => (
                <Chip key={c} label={c} active={contexte === c} onPress={() => { setContexte(c); if (c !== 'Match') setMatchMinute(''); }} />
              ))}
            </View>
            {contexte === 'Match' && (
              <TextInput style={[styles.field, { marginBottom: 12 }]} value={matchMinute} onChangeText={(t) => setMatchMinute(t.replace(/\D/g, '').slice(0, 3))} placeholder="Minute de jeu (ex : 34)" placeholderTextColor={COLORS.muted} keyboardType="number-pad" />
            )}

            <Text style={styles.fieldLabel}>Douleur ressentie (1 = faible, 10 = très intense)</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'].map((n) => (
                <TouchableOpacity key={n} onPress={() => setDouleur(n)} style={[styles.painDot, douleur === n && { backgroundColor: '#3DA9FC', borderColor: '#3DA9FC' }]}>
                  <Text style={{ color: douleur === n ? '#0F1F2E' : COLORS.text, fontWeight: '700', fontSize: 12 }}>{n}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Suspicion de commotion</Text>
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12 }}>
              <Chip label="Oui" active={suspicionCommotion === true} onPress={() => setSuspicionCommotion(true)} />
              <Chip label="Non" active={suspicionCommotion === false} onPress={() => setSuspicionCommotion(false)} />
            </View>

            <Text style={styles.fieldLabel}>Zone du corps</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              {ZONES.map((z) => <Chip key={z} label={z} active={zone === z} onPress={() => setZone(z)} />)}
            </View>
            {!!zone && (
              <TextInput style={[styles.field, { marginBottom: 12 }]} value={zoneRemarque} onChangeText={setZoneRemarque} placeholder="Remarque sur la zone (optionnel)…" placeholderTextColor={COLORS.muted} />
            )}

            <Text style={styles.fieldLabel}>Côté</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              {COTES.map((c) => <Chip key={c} label={c} active={cote === c} onPress={() => setCote(c)} />)}
            </View>

            <Text style={styles.fieldLabel}>Symptômes</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              {SYMPTOMES.map((s) => (
                <Chip key={s} label={s} active={symptomes.includes(s)} onPress={() => setSymptomes((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s])} />
              ))}
            </View>
            {symptomes.includes('Autres') && (
              <TextInput style={[styles.field, { marginBottom: 12 }]} value={symptomesAutre} onChangeText={setSymptomesAutre} placeholder="Préciser le symptôme…" placeholderTextColor={COLORS.muted} />
            )}

            <Text style={styles.fieldLabel}>Diagnostic</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              {DIAGNOSTICS.map((d) => <Chip key={d} label={d} active={diagnostic === d} onPress={() => setDiagnostic(d)} />)}
            </View>
            {diagnostic === 'Autre' && (
              <TextInput style={[styles.field, { marginBottom: 12 }]} value={diagnosticAutre} onChangeText={setDiagnosticAutre} placeholder="Préciser le diagnostic…" placeholderTextColor={COLORS.muted} />
            )}
            {!!diagnostic && (
              <TextInput style={[styles.field, { marginBottom: 12 }]} value={diagnosticRemarque} onChangeText={setDiagnosticRemarque} placeholder="Remarque sur le diagnostic (optionnel)…" placeholderTextColor={COLORS.muted} />
            )}

            <Text style={styles.fieldLabel}>Mécanisme de la blessure</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              {MECANISMES.map((m) => <Chip key={m} label={m} active={mecanisme === m} onPress={() => setMecanisme(m)} />)}
            </View>
            {mecanisme === 'Autres' && (
              <TextInput style={[styles.field, { marginBottom: 12 }]} value={mecanismeAutre} onChangeText={setMecanismeAutre} placeholder="Préciser le mécanisme…" placeholderTextColor={COLORS.muted} />
            )}
            {!!mecanisme && (
              <TextInput style={[styles.field, { marginBottom: 12 }]} value={mecanismeRemarque} onChangeText={setMecanismeRemarque} placeholder="Remarque sur le mécanisme (optionnel)…" placeholderTextColor={COLORS.muted} />
            )}

            <Text style={styles.fieldLabel}>Imagerie</Text>
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12 }}>
              <Chip label="Oui" active={imagerie === true} onPress={() => setImagerie(true)} />
              <Chip label="Non" active={imagerie === false} onPress={() => { setImagerie(false); setImagerieDate(''); }} />
            </View>
            {imagerie && (
              <>
                <Text style={styles.fieldLabel}>Date du rendez-vous d'imagerie</Text>
                <TextInput style={[styles.field, { marginBottom: 12 }]} value={imagerieDate} onChangeText={(t) => setImagerieDate(formatDateInput(t))} placeholder="JJ/MM/AAAA" placeholderTextColor={COLORS.muted} keyboardType="number-pad" maxLength={10} />
              </>
            )}

            <Text style={styles.fieldLabel}>Rendez-vous médecin</Text>
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12 }}>
              <Chip label="Oui" active={rdvMedecin === true} onPress={() => setRdvMedecin(true)} />
              <Chip label="Non" active={rdvMedecin === false} onPress={() => { setRdvMedecin(false); setRdvMedecinDate(''); }} />
            </View>
            {rdvMedecin && (
              <>
                <Text style={styles.fieldLabel}>Date du rendez-vous médecin</Text>
                <TextInput style={[styles.field, { marginBottom: 12 }]} value={rdvMedecinDate} onChangeText={(t) => setRdvMedecinDate(formatDateInput(t))} placeholder="JJ/MM/AAAA" placeholderTextColor={COLORS.muted} keyboardType="number-pad" maxLength={10} />
              </>
            )}

            {STATUS_CHOICE_ROLES.includes(role) && (
              <>
                <Text style={styles.fieldLabel}>Statut du joueur{isEdit ? '' : ' suite à cette blessure'}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                  {STATUTS.map((s) => (
                    <Chip key={s.key} label={s.label} active={newStatus === s.key} onPress={() => setNewStatus(s.key)} />
                  ))}
                </View>
              </>
            )}

            <Text style={{ color: COLORS.muted, fontSize: 12, marginBottom: 12 }}>
              {STATUS_CHOICE_ROLES.includes(role)
                ? "L'ajout de photos ou de compte-rendu d'examen arrive dans une prochaine mise à jour."
                : isEdit
                  ? "L'ajout de photos ou de compte-rendu d'examen arrive dans une prochaine mise à jour."
                  : "L'ajout de photos ou de compte-rendu d'examen arrive dans une prochaine mise à jour. Dès l'enregistrement, le statut du joueur passera automatiquement à « Indisponible »."}
            </Text>

            <TouchableOpacity
              style={styles.btnPrimary}
              onPress={() => {
                const finalDiagnostic = diagnostic === 'Autre' ? diagnosticAutre : diagnostic;
                const finalMecanisme = mecanisme === 'Autres' ? mecanismeAutre : mecanisme;
                onSave({
                  date, zone, zoneRemarque, cote, diagnostic: finalDiagnostic, diagnosticRemarque, mecanisme: finalMecanisme, mecanismeRemarque,
                  imagerie, imagerieDate, contexte, matchMinute: contexte === 'Match' ? matchMinute : '',
                  douleur, suspicionCommotion, symptomes: symptomes.join(', '), symptomesAutre: symptomes.includes('Autres') ? symptomesAutre : '',
                  rdvMedecin, rdvMedecinDate: rdvMedecin ? rdvMedecinDate : '',
                  newStatus: STATUS_CHOICE_ROLES.includes(role) ? newStatus : 'indisponible',
                });
                reset();
              }}
            >
              <Text style={styles.btnPrimaryText}>{isEdit ? 'Enregistrer les modifications' : 'Enregistrer la blessure'}</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function ProfileMenuModal({ visible, onClose, onChangeProfile, onLogout }) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.sheetOverlay}>
        <View style={styles.sheet}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 }}>
            <Text style={styles.heading}>MENU</Text>
            <TouchableOpacity onPress={onClose}><Text style={{ color: COLORS.muted, fontSize: 24, padding: 4 }}>✕</Text></TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.menuBtn} onPress={() => { onClose(); onChangeProfile(); }}>
            <Text style={styles.menuBtnText}>Changer de profil</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.menuBtn, { marginTop: 10 }]} onPress={() => { onClose(); onLogout(); }}>
            <Text style={[styles.menuBtnText, { color: '#F0654A' }]}>Se déconnecter</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function PhaseEditor({ blessure, onSave }) {
  const [phase, setPhase] = useState(blessure.phase || 'blessure');
  const [label, setLabel] = useState(blessure.prochaineEtapeLabel || '');
  const [date, setDate] = useState(blessure.prochaineEtapeDate || '');
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    setPhase(blessure.phase || 'blessure');
    setLabel(blessure.prochaineEtapeLabel || '');
    setDate(blessure.prochaineEtapeDate || '');
  }, [blessure.id]);

  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={styles.fieldLabel}>Parcours de reprise</Text>
      <PhaseTrack current={phase} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12, marginBottom: 12 }}>
        {PHASES.map((p) => (
          <Chip key={p.key} label={p.label} active={phase === p.key} onPress={() => { setPhase(p.key); setJustSaved(false); }} />
        ))}
      </View>
      <TextInput style={[styles.field, { marginBottom: 8 }]} placeholder="Prochaine étape (ex : Réévaluation)" placeholderTextColor={COLORS.muted} value={label} onChangeText={(t) => { setLabel(t); setJustSaved(false); }} />
      <TextInput style={[styles.field, { marginBottom: 10 }]} placeholder="Quand (ex : aujourd'hui, demain, vendredi, JJ/MM)" placeholderTextColor={COLORS.muted} value={date} onChangeText={(t) => { setDate(t); setJustSaved(false); }} />
      <TouchableOpacity
        style={[styles.btnPrimary, { paddingVertical: 10 }]}
        onPress={() => { onSave({ phase, prochaineEtapeLabel: label, prochaineEtapeDate: date }); setJustSaved(true); }}
      >
        <Text style={styles.btnPrimaryText}>Enregistrer le parcours</Text>
      </TouchableOpacity>
      {justSaved && <Text style={{ color: '#52D17C', fontSize: 12, marginTop: 8, fontWeight: '700' }}>✓ Parcours enregistré</Text>}
    </View>
  );
}

function AvisMedecinField({ value, onSave }) {
  const [val, setVal] = useState(value || '');
  useEffect(() => { setVal(value || ''); }, [value]);
  return (
    <View style={{ marginBottom: 12, backgroundColor: '#3DA9FC18', borderWidth: 1, borderColor: '#3DA9FC', borderRadius: 8, padding: 10 }}>
      <Text style={[styles.fieldLabel, { color: '#3DA9FC' }]}>Avis médical</Text>
      <TextInput
        style={{ color: COLORS.text, fontSize: 14, marginTop: 6, minHeight: 60, textAlignVertical: 'top' }}
        value={val}
        onChangeText={setVal}
        multiline
        placeholder="Ajouter un avis médical…"
        placeholderTextColor={COLORS.muted}
      />
      <TouchableOpacity style={[styles.btnPrimary, { backgroundColor: '#3DA9FC', marginTop: 8, paddingVertical: 8 }]} onPress={() => onSave(val)}>
        <Text style={styles.btnPrimaryText}>Enregistrer l'avis</Text>
      </TouchableOpacity>
    </View>
  );
}

function BlessureDetailModal({ blessure, onClose, onDelete, onEdit, canEdit, canComment, onSaveAvis, extraContent, onMarkFinished, onSavePhase }) {
  if (!blessure) return null;
  const b = blessure;
  return (
    <Modal visible={!!blessure} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.sheetOverlay}>
        <View style={[styles.sheet, { maxHeight: '85%' }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 }}>
            <Text style={styles.heading}>{blessureLabel(b).toUpperCase()}</Text>
            <TouchableOpacity onPress={onClose}><Text style={{ color: COLORS.muted, fontSize: 24, padding: 4 }}>✕</Text></TouchableOpacity>
          </View>
          <ScrollView>
            {extraContent}
            {!!b.date && (
              <View style={{ marginBottom: 12 }}>
                <Text style={styles.fieldLabel}>Date</Text>
                <Text style={{ color: COLORS.text, fontSize: 14 }}>{b.date}</Text>
              </View>
            )}
            {!!b.contexte && (
              <View style={{ marginBottom: 12 }}>
                <Text style={styles.fieldLabel}>Contexte</Text>
                <Text style={{ color: COLORS.text, fontSize: 14 }}>{b.contexte}{b.contexte === 'Match' && b.matchMinute ? ` · ${b.matchMinute}e minute` : ''}</Text>
              </View>
            )}
            {!!b.douleur && (
              <View style={{ marginBottom: 12 }}>
                <Text style={styles.fieldLabel}>Douleur ressentie</Text>
                <Text style={{ color: COLORS.text, fontSize: 14 }}>{b.douleur} / 10</Text>
              </View>
            )}
            {b.suspicionCommotion && (
              <View style={{ marginBottom: 12 }}>
                <Text style={[styles.fieldLabel, { color: '#F0654A' }]}>⚠ Suspicion de commotion</Text>
              </View>
            )}
            {!!b.zone && (
              <View style={{ marginBottom: 12 }}>
                <Text style={styles.fieldLabel}>Zone du corps</Text>
                <Text style={{ color: COLORS.text, fontSize: 14 }}>{b.zone}{b.cote && b.cote !== 'Non concerné' ? ` (${b.cote})` : ''}</Text>
                {!!b.zoneRemarque && <Text style={{ color: COLORS.muted, fontSize: 12, marginTop: 2 }}>{b.zoneRemarque}</Text>}
              </View>
            )}
            {!!b.symptomes && (
              <View style={{ marginBottom: 12 }}>
                <Text style={styles.fieldLabel}>Symptômes</Text>
                <Text style={{ color: COLORS.text, fontSize: 14 }}>{b.symptomes}</Text>
                {!!b.symptomesAutre && <Text style={{ color: COLORS.muted, fontSize: 12, marginTop: 2 }}>{b.symptomesAutre}</Text>}
              </View>
            )}
            {!!b.diagnostic && (
              <View style={{ marginBottom: 12 }}>
                <Text style={styles.fieldLabel}>Diagnostic</Text>
                <Text style={{ color: COLORS.text, fontSize: 14 }}>{b.diagnostic}</Text>
                {!!b.diagnosticRemarque && <Text style={{ color: COLORS.muted, fontSize: 12, marginTop: 2 }}>{b.diagnosticRemarque}</Text>}
              </View>
            )}
            {!!b.mecanisme && (
              <View style={{ marginBottom: 12 }}>
                <Text style={styles.fieldLabel}>Mécanisme</Text>
                <Text style={{ color: COLORS.text, fontSize: 14 }}>{b.mecanisme}</Text>
                {!!b.mecanismeRemarque && <Text style={{ color: COLORS.muted, fontSize: 12, marginTop: 2 }}>{b.mecanismeRemarque}</Text>}
              </View>
            )}
            <View style={{ marginBottom: 12 }}>
              <Text style={styles.fieldLabel}>Imagerie</Text>
              <Text style={{ color: COLORS.text, fontSize: 14 }}>{b.imagerie ? `Oui · rendez-vous le ${b.imagerieDate || '(date à préciser)'}` : 'Non'}</Text>
            </View>
            <View style={{ marginBottom: 12 }}>
              <Text style={styles.fieldLabel}>Rendez-vous médecin</Text>
              <Text style={{ color: COLORS.text, fontSize: 14 }}>{b.rdvMedecin ? `Oui · rendez-vous le ${b.rdvMedecinDate || '(date à préciser)'}` : 'Non'}</Text>
            </View>
            {canEdit ? (
              <PhaseEditor blessure={b} onSave={(data) => onSavePhase(b.id, data)} />
            ) : (
              !!b.phase && (
                <View style={{ marginBottom: 16 }}>
                  <Text style={styles.fieldLabel}>Parcours de reprise</Text>
                  <PhaseTrack current={b.phase} />
                  <Text style={{ color: (PHASES.find((p) => p.key === b.phase) || {}).color || COLORS.text, fontSize: 13, fontWeight: '700', marginTop: 10 }}>
                    {(PHASES.find((p) => p.key === b.phase) || {}).label}
                  </Text>
                  {!!b.prochaineEtapeLabel && (
                    <Text style={{ color: COLORS.muted, fontSize: 12, marginTop: 2 }}>
                      Prochaine étape : {b.prochaineEtapeLabel}{b.prochaineEtapeDate ? ` — ${b.prochaineEtapeDate}` : ''}
                    </Text>
                  )}
                </View>
              )
            )}
            {canComment ? (
              <AvisMedecinField value={b.avisMedecin} onSave={(val) => onSaveAvis(b.id, val)} />
            ) : (
              !!b.avisMedecin && (
                <View style={{ marginBottom: 12, backgroundColor: '#3DA9FC18', borderWidth: 1, borderColor: '#3DA9FC', borderRadius: 8, padding: 10 }}>
                  <Text style={[styles.fieldLabel, { color: '#3DA9FC' }]}>Avis médical</Text>
                  <Text style={{ color: COLORS.text, fontSize: 14, marginTop: 4 }}>{b.avisMedecin}</Text>
                </View>
              )
            )}
            {!canEdit && !canComment && <Text style={{ color: COLORS.muted, fontSize: 11, marginTop: 4 }}>Lecture seule pour ton profil.</Text>}
            {canEdit && (
              <>
                <TouchableOpacity style={[styles.btnPrimary, { marginTop: 8 }]} onPress={() => onEdit(b)}>
                  <Text style={styles.btnPrimaryText}>Modifier cette blessure</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.btnPrimary, { backgroundColor: '#52D17C', marginTop: 10 }]}
                  onPress={() => Alert.alert(
                    'Blessure terminée ?',
                    'Le joueur repassera automatiquement disponible, et cette blessure sera archivée dans son historique.',
                    [
                      { text: 'Non', style: 'cancel' },
                      { text: 'Oui, elle est finie', onPress: () => { onMarkFinished(b); onClose(); } },
                    ]
                  )}
                >
                  <Text style={styles.btnPrimaryText}>Marquer comme terminée</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.btnPrimary, { backgroundColor: '#F0654A', marginTop: 10 }]}
                  onPress={() => Alert.alert('Confirmer la suppression', 'Supprimer cette blessure ?', [
                    { text: 'Non', style: 'cancel' },
                    { text: 'Oui, supprimer', style: 'destructive', onPress: () => { onDelete(b.id); onClose(); } },
                  ])}
                >
                  <Text style={styles.btnPrimaryText}>Supprimer cette blessure</Text>
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function QuickBlessureFlow({ visible, players, onClose, onSave, role }) {
  const [step, setStep] = useState('pick');
  const [search, setSearch] = useState('');
  const [playerId, setPlayerId] = useState(null);

  useEffect(() => {
    if (visible) { setStep('pick'); setSearch(''); setPlayerId(null); }
  }, [visible]);

  if (step === 'form') {
    return (
      <BlessureFormModal
        visible={visible}
        initial={null}
        role={role}
        onClose={onClose}
        onSave={(data) => onSave(playerId, data)}
      />
    );
  }

  const filtered = players.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.sheetOverlay}>
        <View style={[styles.sheet, { maxHeight: '80%' }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 }}>
            <Text style={styles.heading}>CHOISIR UN JOUEUR</Text>
            <TouchableOpacity onPress={onClose}><Text style={{ color: COLORS.muted, fontSize: 24, padding: 4 }}>✕</Text></TouchableOpacity>
          </View>
          <View style={styles.searchBox}>
            <Text style={{ color: COLORS.muted }}>⌕</Text>
            <TextInput style={styles.searchInput} placeholder="Rechercher un joueur…" placeholderTextColor={COLORS.muted} value={search} onChangeText={setSearch} autoFocus />
          </View>
          <ScrollView style={{ marginTop: 12 }}>
            {filtered.length === 0 && <Text style={styles.empty}>Aucun joueur trouvé.</Text>}
            {filtered.map((p) => (
              <TouchableOpacity key={p.id} style={styles.card} onPress={() => { setPlayerId(p.id); setStep('form'); }}>
                <Avatar player={p} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '700', fontSize: 15, color: COLORS.text }}>{p.name}</Text>
                  {!!p.poste && <Text style={{ fontSize: 11, color: COLORS.muted }}>{p.poste}</Text>}
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export default function App() {
  const [pin, setPin] = useState('');
  const [welcomeSeen, setWelcomeSeen] = useState(false);
  const [role, setRole] = useState('');
  const [roleReady, setRoleReady] = useState(false);
  const [accountRoles, setAccountRoles] = useState(null);
  const [accountNom, setAccountNom] = useState('');
  const [accountReady, setAccountReady] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [pinReady, setPinReady] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [tab, setTab] = useState('infos');
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [showPlayersList, setShowPlayersList] = useState(false);
  const [medecinBlessuresScreen, setMedecinBlessuresScreen] = useState(false);
  const [medecinSelectedBlessureId, setMedecinSelectedBlessureId] = useState(null);
  const [showQuickBlessure, setShowQuickBlessure] = useState(false);
  const [pendingBlessurePlayerId, setPendingBlessurePlayerId] = useState(null);

  // Jour de match — staff
  const [matches, setMatches] = useState([]);
  const [matchesLoaded, setMatchesLoaded] = useState(false);
  const [matchDayScreen, setMatchDayScreen] = useState(null); // null | 'list' | 'detail' | 'soins'
  const [matchDaySelectedId, setMatchDaySelectedId] = useState(null);
  const [creneauxLoadedFor, setCreneauxLoadedFor] = useState(null);
  const [creneauxForMatch, setCreneauxForMatch] = useState([]);
  const [showAddMatch, setShowAddMatch] = useState(false);
  const [editingMatchId, setEditingMatchId] = useState(null);
  const [showAccountsScreen, setShowAccountsScreen] = useState(false);
  const [accountsList, setAccountsList] = useState([]);
  const [accountsLoaded, setAccountsLoaded] = useState(false);
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [newAccountNom, setNewAccountNom] = useState('');
  const [newAccountEmail, setNewAccountEmail] = useState('');
  const [newAccountPassword, setNewAccountPassword] = useState('');
  const [newAccountRoles, setNewAccountRoles] = useState([]);
  const [newMatchTitre, setNewMatchTitre] = useState('');
  const [newMatchDate, setNewMatchDate] = useState('');
  const [newMatchHeure, setNewMatchHeure] = useState('');
  const [newMatchDomicile, setNewMatchDomicile] = useState('');
  const [newMatchExterieur, setNewMatchExterieur] = useState('');
  const [newMatchType, setNewMatchType] = useState('');
  const [newMatchLogoDomicile, setNewMatchLogoDomicile] = useState('');
  const [newMatchLogoExterieur, setNewMatchLogoExterieur] = useState('');

  // Jour de match — joueur
  const [joueurIdentityId, setJoueurIdentityId] = useState(null);
  const [medecinLastSeen, setMedecinLastSeen] = useState(null);
  const [medecinLastSeenReady, setMedecinLastSeenReady] = useState(false);

  // Notifications generalisees ("qui a ajoute quoi")
  const [activites, setActivites] = useState([]);
  const [activitesLoaded, setActivitesLoaded] = useState(false);
  const [notifLastSeen, setNotifLastSeen] = useState(null);
  const [notifLastSeenReady, setNotifLastSeenReady] = useState(false);
  const [showNotifScreen, setShowNotifScreen] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [identityCandidateId, setIdentityCandidateId] = useState(null);
  const [identityPinInput, setIdentityPinInput] = useState('');
  const [identityPinError, setIdentityPinError] = useState('');
  const [joueurIdentityReady, setJoueurIdentityReady] = useState(false);
  const [joueurScreen, setJoueurScreen] = useState('matchlist'); // 'matchlist' | 'booking'
  const [joueurSelectedMatchId, setJoueurSelectedMatchId] = useState(null);
  const [bookHeure, setBookHeure] = useState('');
  const [bookSoinType, setBookSoinType] = useState('');
  const [bookZones, setBookZones] = useState([]);
  const [newName, setNewName] = useState('');
  const [newPoste, setNewPoste] = useState('');
  const [soinInput, setSoinInput] = useState('');
  const [histInput, setHistInput] = useState('');
  const [clubInput, setClubInput] = useState('');
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [summaryFilter, setSummaryFilter] = useState(null);
  const [medicalSub, setMedicalSub] = useState('blessures');
  const [showBlessureForm, setShowBlessureForm] = useState(false);
  const [editingBlessure, setEditingBlessure] = useState(null);
  const [selectedBlessureId, setSelectedBlessureId] = useState(null);
  const [blessureViewFromHistorique, setBlessureViewFromHistorique] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem('app_pin').then((stored) => {
      if (stored) { setPin(stored); load(stored); }
      setPinReady(true);
    });
    AsyncStorage.getItem('user_role').then((stored) => {
      if (stored) setRole(stored);
      setRoleReady(true);
    });
    AsyncStorage.getItem('medecin_last_seen_blessures').then((stored) => {
      setMedecinLastSeen(stored || null);
      setMedecinLastSeenReady(true);
    });
    AsyncStorage.getItem('account_roles').then((stored) => {
      if (stored) { try { setAccountRoles(JSON.parse(stored)); } catch { setAccountRoles(null); } }
      setAccountReady(true);
    });
    AsyncStorage.getItem('account_nom').then((stored) => { if (stored) setAccountNom(stored); });
  }, []);

  const doLogin = async () => {
    if (!loginEmail.trim() || !loginPassword.trim()) return;
    setLoginLoading(true);
    setLoginError('');
    try {
      const result = await login(loginEmail.trim(), loginPassword.trim());
      await AsyncStorage.setItem('account_roles', JSON.stringify(result.roles));
      await AsyncStorage.setItem('account_nom', result.nom);
      setAccountRoles(result.roles);
      setAccountNom(result.nom);
    } catch {
      setLoginError('Identifiants incorrects.');
    }
    setLoginLoading(false);
  };

  const logoutAccount = async () => {
    await AsyncStorage.removeItem('account_roles');
    await AsyncStorage.removeItem('account_nom');
    await AsyncStorage.removeItem('user_role');
    setAccountRoles(null);
    setAccountNom('');
    goHome();
    setRole('');
  };

  // "Changer de profil" : si le compte n'a qu'un seul profil, ça boucle sans jamais
  // pouvoir se déconnecter — on force alors une déconnexion complète à la place.
  const changeProfile = async () => {
    const hasChoice = accountRoles && (accountRoles.length > 1 || accountRoles.includes('administrateur'));
    if (!hasChoice) {
      await logoutAccount();
    } else {
      await AsyncStorage.removeItem('user_role');
      goHome();
      setRole('');
    }
  };

  const markBlessuresSeen = async () => {
    const now = new Date().toISOString();
    await AsyncStorage.setItem('medecin_last_seen_blessures', now);
    setMedecinLastSeen(now);
  };

  useEffect(() => {
    setCurrentRole(role);
  }, [role]);

  useEffect(() => {
    if (!role) return;
    AsyncStorage.getItem(`notif_last_seen_${role}`).then((stored) => {
      setNotifLastSeen(stored || null);
      setNotifLastSeenReady(true);
    });
  }, [role]);

  const loadActivites = async () => {
    try {
      setActivites(await api.getActivites(pin));
      setActivitesLoaded(true);
    } catch {
      setToast('Impossible de charger les notifications.');
    }
  };

  const markNotifsSeen = async () => {
    const now = new Date().toISOString();
    await AsyncStorage.setItem(`notif_last_seen_${role}`, now);
    setNotifLastSeen(now);
  };

  const relevantActivites = activites.filter((a) => {
    if (role === 'medecin') return a.role === 'soigneur';
    if (role === 'soigneur' || role === 'administrateur') return a.role !== role;
    return false;
  });
  const unseenNotifCount = notifLastSeenReady
    ? relevantActivites.filter((a) => !notifLastSeen || new Date(a.createdAt) > new Date(notifLastSeen)).length
    : 0;

  const openProfileMenu = () => {
    setShowProfileMenu(true);
  };

  const selectRole = async (key) => {
    await AsyncStorage.setItem('user_role', key);
    setRole(key);
  };

  const goHome = () => {
    setShowAdd(false);
    setShowBlessureForm(false);
    setEditingBlessure(null);
    setSelectedBlessureId(null);
    setBlessureViewFromHistorique(false);
    setShowStatusPicker(false);
    setSummaryFilter(null);
    setSelectedId(null);
    setShowPlayersList(false);
    setShowQuickBlessure(false);
    setPendingBlessurePlayerId(null);
    setMatchDayScreen(null);
    setMatchDaySelectedId(null);
    setCreneauxLoadedFor(null);
    setShowAddMatch(false);
    setEditingMatchId(null);
    setMedecinBlessuresScreen(false);
    setMedecinSelectedBlessureId(null);
    setShowAccountsScreen(false);
    setShowAddAccount(false);
    setShowNotifScreen(false);
    setShowProfileMenu(false);
  };

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (role === 'joueur') {
        if (identityCandidateId) { setIdentityCandidateId(null); setIdentityPinInput(''); setIdentityPinError(''); return true; }
        if (joueurScreen === 'booking') { setJoueurScreen('matchlist'); setBookHeure(''); setBookSoinType(''); setBookZones([]); return true; }
        return false;
      }
      if (pendingBlessurePlayerId) { setPendingBlessurePlayerId(null); return true; }
      if (showNotifScreen) { setShowNotifScreen(false); return true; }
      if (showProfileMenu) { setShowProfileMenu(false); return true; }
      if (showAddAccount) { setShowAddAccount(false); return true; }
      if (showAccountsScreen) { setShowAccountsScreen(false); return true; }
      if (showAdd) { setShowAdd(false); return true; }
      if (showAddMatch) { setShowAddMatch(false); return true; }
      if (showQuickBlessure) { setShowQuickBlessure(false); return true; }
      if (showBlessureForm) { setShowBlessureForm(false); setEditingBlessure(null); return true; }
      if (selectedBlessureId) { setSelectedBlessureId(null); return true; }
      if (showStatusPicker) { setShowStatusPicker(false); return true; }
      if (summaryFilter) { setSummaryFilter(null); return true; }
      if (medecinSelectedBlessureId) { setMedecinSelectedBlessureId(null); return true; }
      if (medecinBlessuresScreen) { setMedecinBlessuresScreen(false); return true; }
      if (selectedId) { setSelectedId(null); return true; }
      if (showPlayersList) { setShowPlayersList(false); load(pin); return true; }
      if (matchDayScreen === 'detail') { setMatchDayScreen('list'); return true; }
      if (matchDayScreen === 'list') { setMatchDayScreen(null); return true; }
      return false; // à l'accueil : laisse le comportement par défaut (quitter l'appli)
    });
    return () => sub.remove();
  }, [role, joueurScreen, identityCandidateId, showAdd, showAddMatch, showQuickBlessure, showBlessureForm, selectedBlessureId, showStatusPicker, summaryFilter, selectedId, showPlayersList, pendingBlessurePlayerId, matchDayScreen, medecinBlessuresScreen, medecinSelectedBlessureId, showAccountsScreen, showAddAccount, showNotifScreen, showProfileMenu]);

  const load = async (activePin) => {
    setLoading(true);
    try {
      setPlayers(await api.getPlayers(activePin));
      setToast('');
    } catch {
      setToast('Impossible de charger les données. Vérifie ta connexion.');
    }
    setLoading(false);
  };

  const loadMatches = async () => {
    try {
      setMatches(await api.getMatches(pin));
      setMatchesLoaded(true);
    } catch {
      setToast('Impossible de charger les matchs.');
    }
  };

  const loadAccounts = async () => {
    try {
      setAccountsList(await api.getUtilisateurs(pin));
      setAccountsLoaded(true);
    } catch {
      setToast('Impossible de charger les comptes.');
    }
  };

  const loadCreneaux = async (matchId) => {
    try {
      setCreneauxForMatch(await api.getCreneaux(pin, matchId));
    } catch {
      setToast('Impossible de charger les créneaux.');
    }
  };

  useEffect(() => {
    if (pin) {
      AsyncStorage.getItem('joueur_identity_player_id').then((stored) => {
        if (stored) setJoueurIdentityId(stored);
        setJoueurIdentityReady(true);
      });
    }
  }, [pin]);

  const chooseJoueurIdentity = async (playerId) => {
    await AsyncStorage.setItem('joueur_identity_player_id', playerId);
    setJoueurIdentityId(playerId);
  };

  const submitPin = async () => {
    const val = pinInput.trim();
    if (!val) return;
    try {
      await api.checkPin(val);
      await AsyncStorage.setItem('app_pin', val);
      setPin(val);
      setPinError('');
      load(val);
    } catch {
      setPinError('Code incorrect.');
    }
  };

  const wrap = async (fn) => {
    try { await fn(); await load(pin); } catch { setToast('Erreur, réessaie.'); setLoading(false); }
  };

  const confirmDelete = (message, action) => {
    Alert.alert('Confirmer la suppression', message, [
      { text: 'Non', style: 'cancel' },
      { text: 'Oui, supprimer', style: 'destructive', onPress: action },
    ]);
  };

  const pickPhoto = async () => {
    Alert.alert('Bientôt disponible', "L'ajout de photo sera activé dans une prochaine mise à jour.");
  };

  if (!pinReady || !roleReady) return <SafeAreaView style={styles.shell} />;

  if (!welcomeSeen) {
    return (
      <SafeAreaView style={styles.shell}>
        <StatusBar barStyle="light-content" />
        <View style={styles.center}>
          <Text style={{ color: '#3DA9FC', fontWeight: '900', fontSize: 40, letterSpacing: 2 }}>MédiXV</Text>
          <Text style={{ color: COLORS.muted, fontSize: 13, marginTop: 10, textAlign: 'center' }}>Suivi médical et disponibilité des joueurs</Text>
          <TouchableOpacity style={[styles.btnPrimary, { width: 200, marginTop: 32 }]} onPress={() => setWelcomeSeen(true)}>
            <Text style={styles.btnPrimaryText}>Me connecter</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!accountReady) return <SafeAreaView style={styles.shell} />;

  if (!accountRoles) {
    return (
      <SafeAreaView style={styles.shell}>
        <StatusBar barStyle="light-content" />
        <KeyboardAvoidingView style={styles.center} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Text style={styles.heading}>CONNEXION</Text>
          <Text style={{ color: COLORS.muted, fontSize: 13, marginTop: 6, marginBottom: 20 }}>Identifie-toi pour continuer</Text>
          <TextInput
            style={[styles.field, { width: '100%' }]}
            placeholder="Adresse mail"
            placeholderTextColor={COLORS.muted}
            value={loginEmail}
            onChangeText={setLoginEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <TextInput
            style={[styles.field, { width: '100%' }]}
            placeholder="Mot de passe"
            placeholderTextColor={COLORS.muted}
            value={loginPassword}
            onChangeText={setLoginPassword}
            secureTextEntry
          />
          <TouchableOpacity style={[styles.btnPrimary, { width: 200, marginTop: 8, opacity: loginLoading ? 0.6 : 1 }]} onPress={doLogin} disabled={loginLoading}>
            <Text style={styles.btnPrimaryText}>{loginLoading ? 'Connexion…' : 'Se connecter'}</Text>
          </TouchableOpacity>
          {!!loginError && <Text style={{ color: '#F0654A', marginTop: 8 }}>{loginError}</Text>}
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  if (!role) {
    const isAdminAccount = accountRoles.includes('administrateur');
    const availableRoles = isAdminAccount ? ROLES : ROLES.filter((r) => accountRoles.includes(r.key));
    if (availableRoles.length === 1) {
      selectRole(availableRoles[0].key);
      return <SafeAreaView style={styles.shell} />;
    }
    return (
      <SafeAreaView style={styles.shell}>
        <StatusBar barStyle="light-content" />
        <View style={[styles.center, { justifyContent: 'flex-start', paddingTop: 60 }]}>
          <Text style={styles.heading}>QUI ES-TU ?</Text>
          <Text style={{ color: COLORS.muted, fontSize: 13, marginTop: 6, marginBottom: isAdminAccount ? 8 : 28, textAlign: 'center' }}>
            {isAdminAccount ? 'Choisis un profil (accès complet Administrateur)' : 'Choisis ton profil pour continuer'}
          </Text>
          {isAdminAccount && (
            <Text style={{ color: COLORS.muted, fontSize: 11, marginBottom: 20, textAlign: 'center' }}>
              En tant qu'administrateur, tu peux prévisualiser n'importe quel profil pour voir comment il se présente.
            </Text>
          )}
          <View style={{ width: '100%', gap: 10 }}>
            {availableRoles.map((r) => (
              <TouchableOpacity key={r.key} style={styles.roleBtn} onPress={() => selectRole(r.key)}>
                <Text style={{ color: COLORS.text, fontWeight: '700', fontSize: 15 }}>{r.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={{ marginTop: 24 }} onPress={logoutAccount}>
            <Text style={{ color: COLORS.muted, fontSize: 13, textDecorationLine: 'underline' }}>Se déconnecter</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const BLOCKED_ROLES = ['entraineur', 'preparateur', 'manager'];

  if (role && BLOCKED_ROLES.includes(role)) {
    return (
      <SafeAreaView style={styles.shell}>
        <StatusBar barStyle="light-content" />
        <View style={styles.center}>
          <Text style={styles.heading}>ACCÈS RÉSERVÉ</Text>
          <Text style={{ color: COLORS.muted, fontSize: 13, marginTop: 10, marginBottom: 28, textAlign: 'center' }}>
            Le suivi des joueurs est réservé à l'encadrement médical et administratif (Soigneur, Médecin, Ostéopathe, Kiné, Administrateur).
          </Text>
          <TouchableOpacity style={[styles.btnPrimary, { width: 220 }]} onPress={changeProfile}>
            <Text style={styles.btnPrimaryText}>Changer de profil</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!pin) {
    return (
      <SafeAreaView style={styles.shell}>
        <StatusBar barStyle="light-content" />
        <KeyboardAvoidingView style={styles.center} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <TouchableOpacity onPress={changeProfile} style={{ position: 'absolute', top: 20, left: 4, padding: 8 }}>
            <Text style={{ color: COLORS.muted, fontSize: 13 }}>‹ Profils</Text>
          </TouchableOpacity>
          <Text style={styles.heading}>SUIVI JOUEURS</Text>
          <Text style={{ color: COLORS.muted, fontSize: 13, marginTop: 6 }}>Code d'accès de l'équipe</Text>
          <TextInput
            style={styles.pinInput}
            secureTextEntry
            keyboardType="number-pad"
            maxLength={8}
            value={pinInput}
            onChangeText={setPinInput}
            placeholder="••••"
            placeholderTextColor={COLORS.muted}
          />
          <TouchableOpacity style={[styles.btnPrimary, { width: 160 }]} onPress={submitPin}>
            <Text style={styles.btnPrimaryText}>Entrer</Text>
          </TouchableOpacity>
          {!!pinError && <Text style={{ color: '#F0654A', marginTop: 8 }}>{pinError}</Text>}
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  if (loading) {
    return <SafeAreaView style={styles.shell}><View style={styles.center}><Text style={{ color: COLORS.muted }}>Chargement…</Text></View></SafeAreaView>;
  }

  // ---------- JOUEUR FLOW ----------
  if (role === 'joueur') {
    if (!joueurIdentityReady) return <SafeAreaView style={styles.shell} />;

    if (!joueurIdentityId) {
      if (identityCandidateId) {
        const candidate = players.find((p) => p.id === identityCandidateId);
        return (
          <SafeAreaView style={styles.shell}>
            <StatusBar barStyle="light-content" />
            <KeyboardAvoidingView style={styles.center} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              <TouchableOpacity onPress={() => { setIdentityCandidateId(null); setIdentityPinInput(''); setIdentityPinError(''); }} style={{ position: 'absolute', top: 0, left: 0, padding: 8 }}>
                <Text style={{ color: COLORS.text, fontSize: 30, fontWeight: '700' }}>‹</Text>
              </TouchableOpacity>
              <Text style={styles.heading}>{(candidate?.name || '').toUpperCase()}</Text>
              <Text style={{ color: COLORS.muted, fontSize: 13, marginTop: 6 }}>Entre ton code à 4 chiffres</Text>
              <TextInput
                style={styles.pinInput}
                secureTextEntry
                keyboardType="number-pad"
                maxLength={4}
                value={identityPinInput}
                onChangeText={setIdentityPinInput}
                placeholder="••••"
                placeholderTextColor={COLORS.muted}
                autoFocus
              />
              <TouchableOpacity
                style={[styles.btnPrimary, { width: 160 }]}
                onPress={() => {
                  if (identityPinInput === '1234') {
                    chooseJoueurIdentity(identityCandidateId);
                    setIdentityCandidateId(null);
                    setIdentityPinInput('');
                    setIdentityPinError('');
                    setSearch('');
                  } else {
                    setIdentityPinError('Code incorrect.');
                  }
                }}
              >
                <Text style={styles.btnPrimaryText}>Valider</Text>
              </TouchableOpacity>
              {!!identityPinError && <Text style={{ color: '#F0654A', marginTop: 8 }}>{identityPinError}</Text>}
            </KeyboardAvoidingView>
          </SafeAreaView>
        );
      }

      const filtered = players.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));
      return (
        <SafeAreaView style={styles.shell}>
          <StatusBar barStyle="light-content" />
          <View style={styles.top}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <Text style={styles.heading}>QUI ES-TU ?</Text>
              <TouchableOpacity onPress={changeProfile}>
                <Text style={{ color: COLORS.muted, fontSize: 11, textDecorationLine: 'underline' }}>Changer de profil</Text>
              </TouchableOpacity>
            </View>
            <Text style={{ color: COLORS.muted, fontSize: 13, marginTop: 6, marginBottom: 14 }}>Sélectionne ton nom dans la liste</Text>
            <View style={styles.searchBox}>
              <Text style={{ color: COLORS.muted }}>⌕</Text>
              <TextInput style={styles.searchInput} placeholder="Rechercher…" placeholderTextColor={COLORS.muted} value={search} onChangeText={setSearch} />
            </View>
          </View>
          <ScrollView style={{ paddingHorizontal: 18 }}>
            {filtered.map((p) => (
              <TouchableOpacity key={p.id} style={styles.card} onPress={() => { setIdentityCandidateId(p.id); setIdentityPinInput(''); setIdentityPinError(''); }}>
                <Avatar player={p} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '700', fontSize: 15, color: COLORS.text }}>{p.name}</Text>
                  {!!p.poste && <Text style={{ fontSize: 11, color: COLORS.muted }}>{p.poste}</Text>}
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </SafeAreaView>
      );
    }

    const me = players.find((p) => p.id === joueurIdentityId);

    // Booking screen
    if (joueurScreen === 'booking' && joueurSelectedMatchId) {
      const match = matches.find((m) => m.id === joueurSelectedMatchId);
      const duree = bookZones.length > 1 ? 10 : 5;
      const takenSlots = new Set(creneauxForMatch.map((c) => c.heure));
      const canValidate = !!bookHeure && !!bookSoinType && bookZones.length > 0;
      return (
        <SafeAreaView style={styles.shell}>
          <StatusBar barStyle="light-content" />
          <View style={styles.detailTop}>
            <TouchableOpacity onPress={() => { setJoueurScreen('matchlist'); setBookHeure(''); setBookSoinType(''); setBookZones([]); }} style={styles.iconBtn}><Text style={{ color: COLORS.text, fontSize: 30, fontWeight: '700' }}>‹</Text></TouchableOpacity>
            <Text style={styles.heading}>{(match ? matchLabel(match) : 'MATCH').toUpperCase()}</Text>
          </View>
          <ScrollView style={{ padding: 18 }}>
            <Text style={styles.fieldLabel}>Créneau (à partir de 13h30)</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
              {MATCH_SLOTS.map((slot) => {
                const taken = takenSlots.has(slot);
                return (
                  <TouchableOpacity key={slot} disabled={taken} onPress={() => setBookHeure(slot)} style={[styles.chip, bookHeure === slot && styles.chipActive, taken && { opacity: 0.3 }]}>
                    <Text style={{ color: bookHeure === slot ? '#0F1F2E' : COLORS.text, fontWeight: '700', fontSize: 12 }}>{slot}{taken ? ' ✕' : ''}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.fieldLabel}>Type de soin</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
              {SOIN_TYPES.map((t) => <Chip key={t} label={t} active={bookSoinType === t} onPress={() => setBookSoinType(t)} />)}
            </View>

            <Text style={styles.fieldLabel}>Zone(s) du corps concernée(s)</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {ZONES.map((z) => (
                <Chip key={z} label={z} active={bookZones.includes(z)} onPress={() => setBookZones((prev) => prev.includes(z) ? prev.filter((x) => x !== z) : [...prev, z])} />
              ))}
            </View>
            <Text style={{ color: COLORS.muted, fontSize: 12, marginBottom: 20 }}>
              Durée du créneau : {duree} minutes{bookZones.length > 1 ? ' (plusieurs zones sélectionnées)' : ''}
            </Text>

            <TouchableOpacity
              style={[styles.btnPrimary, !canValidate && { opacity: 0.5 }]}
              disabled={!canValidate}
              onPress={() => {
                wrap(async () => {
                  await api.addCreneau(pin, joueurSelectedMatchId, { playerId: joueurIdentityId, heure: bookHeure, duree, soinType: bookSoinType, zones: bookZones.join(', ') });
                });
                setJoueurScreen('matchlist');
                setBookHeure(''); setBookSoinType(''); setBookZones([]);
                Alert.alert('Créneau réservé', `Ton créneau de ${bookSoinType.toLowerCase()} à ${bookHeure} est enregistré.`);
              }}
            >
              <Text style={styles.btnPrimaryText}>Valider</Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      );
    }

    // Match list screen (default)
    if (!matchesLoaded) { loadMatches(); }
    return (
      <SafeAreaView style={styles.shell}>
        <StatusBar barStyle="light-content" />
        <View style={styles.top}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Text style={styles.heading}>JOUR DE MATCH</Text>
            <View style={{ alignItems: 'flex-end', gap: 4 }}>
              <TouchableOpacity onPress={async () => { await AsyncStorage.removeItem('joueur_identity_player_id'); setJoueurIdentityId(null); }}>
                <Text style={{ color: COLORS.muted, fontSize: 11, textDecorationLine: 'underline' }}>Pas {me?.name || 'toi'} ?</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={changeProfile}>
                <Text style={{ color: COLORS.muted, fontSize: 11, textDecorationLine: 'underline' }}>Changer de profil</Text>
              </TouchableOpacity>
            </View>
          </View>
          <Text style={{ color: COLORS.muted, fontSize: 13, marginTop: 6 }}>Choisis un match pour réserver ton créneau de soin</Text>
        </View>
        <ScrollView style={{ paddingHorizontal: 18, marginTop: 10 }}>
          {matches.length === 0 && <Text style={styles.empty}>Aucun match programmé.</Text>}
          {matches.map((m) => (
            <MatchRow
              key={m.id}
              m={m}
              onPress={() => { setJoueurSelectedMatchId(m.id); loadCreneaux(m.id); setJoueurScreen('booking'); }}
            />
          ))}
        </ScrollView>
        {!!toast && <View style={styles.toast}><Text style={{ color: '#fff', fontSize: 12, textAlign: 'center' }}>{toast}</Text></View>}
      </SafeAreaView>
    );
  }

  const player = players.find((p) => p.id === selectedId);

  // ---------- DETAIL ----------
  if (player) {
    const activeSoins = player.soins.filter((s) => s.actif);
    const oldSoins = player.soins.filter((s) => !s.actif);
    const age = calcAge(player.birthdate);
    const canEditBlessures = BLESSURE_EDIT_ROLES.includes(role);
    const canEditPlayer = PLAYER_EDIT_ROLES.includes(role);

    return (
      <SafeAreaView style={styles.shell}>
        <StatusBar barStyle="light-content" />
        <View style={styles.detailTop}>
          <TouchableOpacity onPress={() => setSelectedId(null)} style={styles.iconBtn}><Text style={{ color: COLORS.text, fontSize: 30, fontWeight: '700' }}>‹</Text></TouchableOpacity>
          <TouchableOpacity onPress={pickPhoto} style={{ marginRight: 4 }}>
            <Avatar player={player} size={44} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.heading}>{player.name.toUpperCase()}</Text>
            <Text style={{ color: COLORS.muted, fontSize: 12 }}>{[player.poste, age !== null ? `${age} ans` : null].filter(Boolean).join(' · ')}</Text>
          </View>
          {canEditPlayer && (
            <TouchableOpacity style={styles.iconBtn} onPress={() => confirmDelete('Supprimer ce joueur et toutes ses données ?', () => wrap(async () => { await api.deletePlayer(pin, player.id); setSelectedId(null); }))}>
              <Text style={{ color: COLORS.muted }}>Suppr.</Text>
            </TouchableOpacity>
          )}
        </View>
        {!!toast && <View style={[styles.toast, { position: 'relative', bottom: undefined, left: undefined, right: undefined, marginHorizontal: 18, marginTop: 10 }]}><Text style={{ color: '#fff', fontSize: 12, textAlign: 'center' }}>{toast}</Text></View>}

        <View style={{ paddingHorizontal: 18, paddingTop: 14 }}>
          <StatusBadge status={player.status} onPress={() => setShowStatusPicker(true)} editable={canEditPlayer} />
        </View>
        <StatusPickerModal
          visible={showStatusPicker}
          current={player.status}
          onClose={() => setShowStatusPicker(false)}
          onSelect={(key) => { setShowStatusPicker(false); wrap(() => api.updatePlayer(pin, player.id, { status: key })); }}
        />
        <BlessureFormModal
          visible={showBlessureForm}
          initial={editingBlessure}
          role={role}
          currentPlayerStatus={player.status}
          onClose={() => { setShowBlessureForm(false); setEditingBlessure(null); }}
          onSave={(data) => {
            const wasEdit = !!editingBlessure;
            const { newStatus, ...blessureData } = data;
            setShowBlessureForm(false);
            setEditingBlessure(null);
            wrap(async () => {
              if (wasEdit) {
                await api.updateBlessure(pin, editingBlessure.id, blessureData);
                if (newStatus) await api.updatePlayer(pin, player.id, { status: newStatus });
              } else {
                await api.addBlessure(pin, player.id, blessureData);
                await api.updatePlayer(pin, player.id, { status: newStatus || 'indisponible' });
              }
            });
          }}
        />
        <BlessureDetailModal
          blessure={(player.blessures || []).find((b) => b.id === selectedBlessureId)}
          canEdit={canEditBlessures && !blessureViewFromHistorique}
          canComment={BLESSURE_COMMENT_ROLES.includes(role) && !blessureViewFromHistorique}
          onClose={() => { setSelectedBlessureId(null); setBlessureViewFromHistorique(false); }}
          onDelete={(id) => wrap(() => api.deleteBlessure(pin, id))}
          onEdit={(b) => { setSelectedBlessureId(null); setEditingBlessure(b); setShowBlessureForm(true); }}
          onSaveAvis={(id, avisMedecin) => wrap(() => api.updateBlessure(pin, id, { avisMedecin }))}
          onSavePhase={(id, data) => wrap(() => api.updateBlessure(pin, id, data))}
          onMarkFinished={(b) => wrap(async () => {
            await api.addHistorique(pin, player.id, `Blessure terminée : ${blessureLabel(b)}${b.diagnostic ? ' — ' + b.diagnostic : ''}`, b.date || today());
            await api.deleteBlessure(pin, b.id);
            await api.updatePlayer(pin, player.id, { status: 'disponible' });
          })}
        />
        <StatusPickerModal
          visible={!!pendingBlessurePlayerId}
          current="indisponible"
          subtitle="Quelle est la disponibilité du joueur suite à cette blessure ?"
          onClose={() => setPendingBlessurePlayerId(null)}
          onSelect={(key) => {
            const pid = pendingBlessurePlayerId;
            setPendingBlessurePlayerId(null);
            wrap(() => api.updatePlayer(pin, pid, { status: key }));
          }}
        />

        <View style={styles.tabs}>
          {[{ key: 'infos', label: 'Infos' }, { key: 'medical', label: 'Médical' }, { key: 'historique', label: 'Historique' }].map((t) => (
            <TouchableOpacity key={t.key} style={[styles.tab, tab === t.key && styles.tabActive]} onPress={() => setTab(t.key)}>
              <Text style={{ color: tab === t.key ? COLORS.text : COLORS.muted, fontWeight: '700', fontSize: 12 }}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <ScrollView style={styles.tabContent} contentContainerStyle={{ paddingBottom: 40 }}>
          {tab === 'infos' && (
            <>
              {!canEditPlayer && <Text style={{ color: COLORS.muted, fontSize: 11, marginBottom: 12 }}>Lecture seule pour ton profil.</Text>}
              <InfoField label="Nom" value={player.name} onSave={(v) => wrap(() => api.updatePlayer(pin, player.id, { name: v }))} readOnly={!canEditPlayer} />
              <InfoField label="Poste" value={player.poste} onSave={(v) => wrap(() => api.updatePlayer(pin, player.id, { poste: v }))} readOnly={!canEditPlayer} />
              <InfoField label="Date de naissance (JJ/MM/AAAA)" value={player.birthdate} onSave={(v) => wrap(() => api.updatePlayer(pin, player.id, { birthdate: v }))} keyboardType="numbers-and-punctuation" readOnly={!canEditPlayer} />
              {age !== null && <Text style={{ color: COLORS.muted, fontSize: 12, marginTop: -8, marginBottom: 12 }}>Âge calculé : {age} ans</Text>}
              <InfoField label="Taille (cm)" value={player.height} onSave={(v) => wrap(() => api.updatePlayer(pin, player.id, { height: v }))} keyboardType="numeric" readOnly={!canEditPlayer} />
              <InfoField label="Poids (kg)" value={player.weight} onSave={(v) => wrap(() => api.updatePlayer(pin, player.id, { weight: v }))} keyboardType="numeric" readOnly={!canEditPlayer} />
              <InfoField label="Téléphone" value={player.phone} onSave={(v) => wrap(() => api.updatePlayer(pin, player.id, { phone: v }))} keyboardType="phone-pad" readOnly={!canEditPlayer} />
              <InfoField label="Email" value={player.email} onSave={(v) => wrap(() => api.updatePlayer(pin, player.id, { email: v }))} keyboardType="email-address" readOnly={!canEditPlayer} />
              <InfoField label="Groupe sanguin" value={player.bloodType} onSave={(v) => wrap(() => api.updatePlayer(pin, player.id, { bloodType: v }))} readOnly={!canEditPlayer} />
              <InfoField label="Allergies" value={player.allergies} onSave={(v) => wrap(() => api.updatePlayer(pin, player.id, { allergies: v }))} multiline readOnly={!canEditPlayer} />
              <InfoField label="Numéro de licence" value={player.licenseNumber} onSave={(v) => wrap(() => api.updatePlayer(pin, player.id, { licenseNumber: v }))} readOnly={!canEditPlayer} />
              <Text style={[styles.fieldLabel, { marginTop: 4, marginBottom: 10, fontSize: 12 }]}>Contact d'urgence</Text>
              <InfoField label="Nom du contact" value={player.emergencyContactName} onSave={(v) => wrap(() => api.updatePlayer(pin, player.id, { emergencyContactName: v }))} readOnly={!canEditPlayer} />
              <InfoField label="Téléphone du contact" value={player.emergencyContactPhone} onSave={(v) => wrap(() => api.updatePlayer(pin, player.id, { emergencyContactPhone: v }))} keyboardType="phone-pad" readOnly={!canEditPlayer} />

              <Text style={[styles.fieldLabel, { marginTop: 4, marginBottom: 10, fontSize: 12 }]}>Clubs précédents</Text>
              {canEditPlayer && (
                <View style={styles.inlineAdd}>
                  <TextInput style={styles.inlineInput} placeholder="Nom du club…" placeholderTextColor={COLORS.muted} value={clubInput} onChangeText={setClubInput} />
                  <TouchableOpacity style={styles.inlineBtn} onPress={() => { if (clubInput.trim()) { wrap(() => api.addClub(pin, player.id, clubInput.trim())); setClubInput(''); } }}>
                    <Text style={styles.inlineBtnText}>+</Text>
                  </TouchableOpacity>
                </View>
              )}
              {(!player.clubs || player.clubs.length === 0) && <Text style={styles.empty}>Aucun club précédent enregistré.</Text>}
              {(player.clubs || []).map((c) => (
                <View key={c.id} style={styles.entry}>
                  <View style={{ flex: 1 }}><Text style={styles.entryTxt}>{c.nom}</Text></View>
                  {canEditPlayer && <TouchableOpacity onPress={() => confirmDelete('Supprimer ce club ?', () => wrap(() => api.deleteClub(pin, c.id)))}><Text style={{ color: COLORS.muted }}>Suppr.</Text></TouchableOpacity>}
                </View>
              ))}
            </>
          )}

          {tab === 'medical' && (
            <>
              <View style={styles.subTabRow}>
                <TouchableOpacity style={[styles.subTabBtn, medicalSub === 'blessures' && styles.subTabBtnActive]} onPress={() => setMedicalSub('blessures')}>
                  <Text style={{ color: medicalSub === 'blessures' ? '#0F1F2E' : COLORS.text, fontWeight: '700', fontSize: 13 }}>Blessures</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.subTabBtn, medicalSub === 'soins' && styles.subTabBtnActive]} onPress={() => setMedicalSub('soins')}>
                  <Text style={{ color: medicalSub === 'soins' ? '#0F1F2E' : COLORS.text, fontWeight: '700', fontSize: 13 }}>Soins</Text>
                </TouchableOpacity>
              </View>

              {medicalSub === 'blessures' && (
                <>
                  {canEditBlessures && (
                    <TouchableOpacity style={[styles.btnPrimary, { marginBottom: 14 }]} onPress={() => { setEditingBlessure(null); setShowBlessureForm(true); }}>
                      <Text style={styles.btnPrimaryText}>Ajouter une nouvelle blessure</Text>
                    </TouchableOpacity>
                  )}
                  {!canEditBlessures && <Text style={{ color: COLORS.muted, fontSize: 11, marginBottom: 12 }}>Lecture seule pour ton profil.</Text>}
                  {(!player.blessures || player.blessures.length === 0) && <Text style={styles.empty}>Aucune blessure enregistrée.</Text>}
                  {sortByDateDesc(player.blessures || [], (b) => b.date).map((b) => (
                    <TouchableOpacity key={b.id} onPress={() => { setBlessureViewFromHistorique(false); setSelectedBlessureId(b.id); }} style={[styles.entry, { borderLeftColor: '#F0654A', flexDirection: 'column', alignItems: 'stretch' }]}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={[styles.entryTxt, { fontWeight: '700' }]}>{blessureLabel(b)}</Text>
                        {canEditBlessures && <TouchableOpacity onPress={() => confirmDelete('Supprimer cette blessure ?', () => wrap(() => api.deleteBlessure(pin, b.id)))}><Text style={{ color: COLORS.muted }}>Suppr.</Text></TouchableOpacity>}
                      </View>
                      {!!b.date && <Text style={styles.entryDate}>{b.date}</Text>}
                      {!!b.diagnostic && <Text style={[styles.entryTxt, { marginTop: 4 }]}>{b.diagnostic}</Text>}
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                        {b.suspicionCommotion && <View style={[styles.tag, { backgroundColor: '#F0654A22', borderWidth: 1, borderColor: '#F0654A' }]}><Text style={[styles.tagText, { color: '#F0654A', fontWeight: '700' }]}>⚠ Suspicion commotion</Text></View>}
                        {!!b.douleur && <View style={styles.tag}><Text style={styles.tagText}>Douleur {b.douleur}/10</Text></View>}
                        {!!b.contexte && <View style={styles.tag}><Text style={styles.tagText}>{b.contexte}{b.contexte === 'Match' && b.matchMinute ? ` · ${b.matchMinute}e` : ''}</Text></View>}
                        {!!b.mecanisme && <View style={styles.tag}><Text style={styles.tagText}>{b.mecanisme}</Text></View>}
                        <View style={styles.tag}><Text style={styles.tagText}>{b.imagerie ? `Imagerie · ${b.imagerieDate || 'date à préciser'}` : 'Pas d\'imagerie'}</Text></View>
                      </View>
                    </TouchableOpacity>
                  ))}
                </>
              )}

              {medicalSub === 'soins' && (
                <>
                  {!canEditPlayer && <Text style={{ color: COLORS.muted, fontSize: 11, marginBottom: 12 }}>Lecture seule pour ton profil.</Text>}
                  {canEditPlayer && (
                    <View style={styles.inlineAdd}>
                      <TextInput style={styles.inlineInput} placeholder="Nouveau soin…" placeholderTextColor={COLORS.muted} value={soinInput} onChangeText={setSoinInput} />
                      <TouchableOpacity style={styles.inlineBtn} onPress={() => { if (soinInput.trim()) { wrap(() => api.addSoin(pin, player.id, soinInput.trim(), today())); setSoinInput(''); } }}>
                        <Text style={styles.inlineBtnText}>+</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                  {activeSoins.length === 0 && oldSoins.length === 0 && <Text style={styles.empty}>Aucun soin enregistré.</Text>}
                  {activeSoins.map((s) => (
                    <View key={s.id}>
                      <View style={[styles.entry, { borderLeftColor: '#F0654A' }]}>
                        <View style={{ flex: 1 }}><Text style={styles.entryTxt}>{s.texte}</Text><Text style={styles.entryDate}>{s.date}</Text></View>
                        {canEditPlayer && <TouchableOpacity onPress={() => confirmDelete('Supprimer ce soin ?', () => wrap(() => api.deleteSoin(pin, s.id)))}><Text style={{ color: COLORS.muted }}>Suppr.</Text></TouchableOpacity>}
                      </View>
                      {canEditPlayer && (
                        <TouchableOpacity onPress={() => wrap(() => api.resolveSoin(pin, s.id))}>
                          <Text style={{ color: '#52D17C', fontSize: 11, fontWeight: '700', marginBottom: 8, marginTop: -4 }}>✓ Marquer comme soigné</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  ))}
                  {oldSoins.length > 0 && <Text style={styles.subheading}>Résolus</Text>}
                  {oldSoins.map((s) => (
                    <View key={s.id} style={styles.entry}>
                      <View style={{ flex: 1 }}><Text style={styles.entryTxt}>{s.texte}</Text><Text style={styles.entryDate}>{s.date}</Text></View>
                      {canEditPlayer && <TouchableOpacity onPress={() => confirmDelete('Supprimer ce soin ?', () => wrap(() => api.deleteSoin(pin, s.id)))}><Text style={{ color: COLORS.muted }}>Suppr.</Text></TouchableOpacity>}
                    </View>
                  ))}
                </>
              )}
            </>
          )}

          {tab === 'historique' && (
            <>
              {!canEditPlayer && <Text style={{ color: COLORS.muted, fontSize: 11, marginBottom: 12 }}>Lecture seule pour ton profil (hors blessures).</Text>}
              {canEditPlayer && (
                <View style={styles.inlineAdd}>
                  <TextInput style={styles.inlineInput} placeholder="Antécédent médical…" placeholderTextColor={COLORS.muted} value={histInput} onChangeText={setHistInput} />
                  <TouchableOpacity style={styles.inlineBtn} onPress={() => { if (histInput.trim()) { wrap(() => api.addHistorique(pin, player.id, histInput.trim(), today())); setHistInput(''); } }}>
                    <Text style={styles.inlineBtnText}>+</Text>
                  </TouchableOpacity>
                </View>
              )}
              {(() => {
                const combined = [
                  ...player.historique.map((h) => ({ type: 'note', id: h.id, date: h.date, texte: h.texte })),
                  ...(player.blessures || []).map((b) => ({ type: 'blessure', id: b.id, date: b.date, texte: `Blessure : ${blessureLabel(b)}`, ref: b })),
                ];
                const sorted = sortByDateDesc(combined, (e) => e.date);
                if (sorted.length === 0) return <Text style={styles.empty}>Aucun antécédent enregistré.</Text>;
                return sorted.map((e) =>
                  e.type === 'blessure' ? (
                    <TouchableOpacity key={'b-' + e.id} onPress={() => { setBlessureViewFromHistorique(true); setSelectedBlessureId(e.id); }} style={[styles.entry, { borderLeftColor: '#F0654A' }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.entryTxt}>{e.texte}</Text>
                        <Text style={styles.entryDate}>{e.date || 'Date non précisée'}</Text>
                      </View>
                      <Text style={{ color: COLORS.muted, fontSize: 11 }}>Voir ›</Text>
                    </TouchableOpacity>
                  ) : (
                    <View key={'n-' + e.id} style={styles.entry}>
                      <View style={{ flex: 1 }}><Text style={styles.entryTxt}>{e.texte}</Text><Text style={styles.entryDate}>{e.date}</Text></View>
                      {canEditPlayer && <TouchableOpacity onPress={() => confirmDelete('Supprimer cette note ?', () => wrap(() => api.deleteHistorique(pin, e.id)))}><Text style={{ color: COLORS.muted }}>Suppr.</Text></TouchableOpacity>}
                    </View>
                  )
                );
              })()}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ---------- LIST ----------
  const filtered = players
    .filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => PRIORITY_ORDER.indexOf(a.status) - PRIORITY_ORDER.indexOf(b.status) || a.name.localeCompare(b.name));

  const ongoingInjuries = players
    .flatMap((p) => (p.blessures || []).map((b) => ({ player: p, blessure: b })));

  const unseenBlessuresCount = role === 'medecin' && medecinLastSeenReady
    ? ongoingInjuries.filter(({ blessure: b }) => b.createdAt && (!medecinLastSeen || new Date(b.createdAt) > new Date(medecinLastSeen))).length
    : 0;

  const activeStatuses = STATUTS.map((s) => ({ ...s, count: players.filter((p) => p.status === s.key).length })).filter((s) => s.count > 0);

  // ---------- MATCH DAY SCREENS (staff) ----------
  if (matchDayScreen === 'detail' && matchDaySelectedId) {
    const match = matches.find((m) => m.id === matchDaySelectedId);
    if (!creneauxLoadedFor || creneauxLoadedFor !== matchDaySelectedId) {
      loadCreneaux(matchDaySelectedId);
      setCreneauxLoadedFor(matchDaySelectedId);
    }
    return (
      <SafeAreaView style={styles.shell}>
        <StatusBar barStyle="light-content" />
        <View style={styles.detailTop}>
          <TouchableOpacity onPress={() => setMatchDayScreen('list')} style={styles.iconBtn}><Text style={{ color: COLORS.text, fontSize: 30, fontWeight: '700' }}>‹</Text></TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.heading}>JOUR DE MATCH</Text>
            {!!match && (
              <Text style={{ color: COLORS.muted, fontSize: 12 }}>
                {[match.date, match.heure].filter(Boolean).join(' · ')}
                {'\n'}{matchLabel(match)}
              </Text>
            )}
          </View>
          <TouchableOpacity style={styles.iconRoundBtn} onPress={() => { setActivitesLoaded(false); setShowNotifScreen(true); }}>
            <Text style={{ color: COLORS.text, fontSize: 16 }}>🔔</Text>
            {bellCount > 0 && <View style={styles.bellBadge}><Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>{bellCount > 9 ? '9+' : bellCount}</Text></View>}
          </TouchableOpacity>
        </View>

        {!!match && (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14, paddingVertical: 16 }}>
            <TeamLogo uri={match.logoDomicile} size={40} />
            <Text style={{ color: COLORS.text, fontWeight: '800', fontSize: 15 }}>{match.equipeDomicile || '?'}</Text>
            <Text style={{ color: COLORS.muted, fontSize: 12 }}>VS</Text>
            <Text style={{ color: COLORS.text, fontWeight: '800', fontSize: 15 }}>{match.equipeExterieur || '?'}</Text>
            <TeamLogo uri={match.logoExterieur} size={40} />
          </View>
        )}

        <ScrollView style={{ paddingHorizontal: 18 }} contentContainerStyle={{ paddingBottom: 40 }}>
          {activeStatuses.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 22 }}>
              {activeStatuses.map((s) => {
                const pct = players.length > 0 ? Math.round((s.count / players.length) * 100) : 0;
                return (
                  <TouchableOpacity key={s.key} style={[styles.statCard, { borderColor: s.color + '55' }]} onPress={() => setSummaryFilter(s)}>
                    <View style={[styles.statIconCircle, { backgroundColor: s.color }]}>
                      <Text style={{ color: '#0F1F2E', fontWeight: '800', fontSize: 13 }}>{STATUS_ICON[s.key] || '•'}</Text>
                    </View>
                    <Text style={{ color: COLORS.text, fontWeight: '800', fontSize: 20, marginTop: 8 }}>{s.count}</Text>
                    <Text style={{ color: COLORS.muted, fontSize: 11, marginTop: 2 }} numberOfLines={1}>{s.short}</Text>
                    <Text style={{ color: COLORS.muted, fontSize: 10, marginTop: 6 }}>{pct}% de l'effectif</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          <Text style={{ color: COLORS.muted, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', marginBottom: 10 }}>Soins programmés</Text>
          {creneauxForMatch.length === 0 && <Text style={styles.empty}>Aucun créneau réservé pour l'instant.</Text>}
          {[...creneauxForMatch].sort((a, b) => a.heure.localeCompare(b.heure)).map((c) => (
            <View key={c.id} style={styles.entry}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={[styles.entryTxt, { fontWeight: '700' }]}>{c.heure} · {c.playerName}</Text>
                  <Text style={{ color: COLORS.muted, fontSize: 11 }}>{c.duree} min</Text>
                </View>
                <Text style={[styles.entryTxt, { marginTop: 4 }]}>{c.soinType}{c.zones ? ` — ${c.zones}` : ''}</Text>
              </View>
            </View>
          ))}

          <Text style={{ color: COLORS.muted, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', marginTop: 22, marginBottom: 10 }}>Actions rapides</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 22 }}>
            {canQuickAddBlessure && (
              <TouchableOpacity style={styles.quickAction} onPress={() => setShowQuickBlessure(true)}>
                <View style={[styles.quickActionCircle, { backgroundColor: '#F0654A22' }]}><Text style={{ color: '#F0654A', fontSize: 20, fontWeight: '800' }}>+</Text></View>
                <Text style={styles.quickActionText}>Nouvelle{'\n'}blessure</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.quickAction} onPress={() => Alert.alert('Bientôt disponible', 'Cette fonctionnalité sera développée prochainement.')}>
              <View style={[styles.quickActionCircle, { backgroundColor: COLORS.surface3 }]}><Text style={{ color: COLORS.muted, fontSize: 18 }}>📝</Text></View>
              <Text style={styles.quickActionText}>Note{'\n'}rapide</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.quickAction} onPress={() => Alert.alert('Bientôt disponible', 'Cette fonctionnalité sera développée prochainement.')}>
              <View style={[styles.quickActionCircle, { backgroundColor: COLORS.surface3 }]}><Text style={{ color: COLORS.muted, fontSize: 18 }}>📋</Text></View>
              <Text style={styles.quickActionText}>Historique{'\n'}match</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
        <SummaryListModal
          visible={!!summaryFilter}
          statut={summaryFilter}
          players={players}
          onClose={() => setSummaryFilter(null)}
          onOpenPlayer={(id) => { setSummaryFilter(null); setSelectedId(id); setTab('infos'); }}
        />
        <QuickBlessureFlow
          visible={showQuickBlessure}
          players={players}
          role={role}
          onClose={() => setShowQuickBlessure(false)}
          onSave={(playerId, data) => {
            const { newStatus, ...blessureData } = data;
            setShowQuickBlessure(false);
            wrap(async () => {
              await api.addBlessure(pin, playerId, blessureData);
              await api.updatePlayer(pin, playerId, { status: newStatus || 'indisponible' });
            });
          }}
        />
        <StatusPickerModal
          visible={!!pendingBlessurePlayerId}
          current="indisponible"
          subtitle="Quelle est la disponibilité du joueur suite à cette blessure ?"
          onClose={() => setPendingBlessurePlayerId(null)}
          onSelect={(key) => {
            const pid = pendingBlessurePlayerId;
            setPendingBlessurePlayerId(null);
            wrap(() => api.updatePlayer(pin, pid, { status: key }));
          }}
        />
        {!!toast && <View style={styles.toast}><Text style={{ color: '#fff', fontSize: 12, textAlign: 'center' }}>{toast}</Text></View>}
      </SafeAreaView>
    );
  }

  if (matchDayScreen === 'list') {
    return (
      <SafeAreaView style={styles.shell}>
        <StatusBar barStyle="light-content" />
        <View style={styles.top}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <TouchableOpacity onPress={() => setMatchDayScreen(null)} style={styles.iconBtn}><Text style={{ color: COLORS.text, fontSize: 30, fontWeight: '700' }}>‹</Text></TouchableOpacity>
            <Text style={styles.heading}>JOUR DE MATCH</Text>
          </View>
        </View>
        <ScrollView style={{ paddingHorizontal: 18, marginTop: 10 }} contentContainerStyle={{ paddingBottom: 40 }}>
          {matches.length === 0 && <Text style={styles.empty}>Aucun match programmé.</Text>}
          {matches.map((m) => (
            <MatchRow
              key={m.id}
              m={m}
              onPress={() => { setMatchDaySelectedId(m.id); setCreneauxLoadedFor(null); setMatchDayScreen('detail'); }}
              onEdit={() => {
                setEditingMatchId(m.id);
                setNewMatchTitre(m.titre || '');
                setNewMatchDate(m.date || '');
                setNewMatchHeure(m.heure || '');
                setNewMatchDomicile(m.equipeDomicile || '');
                setNewMatchExterieur(m.equipeExterieur || '');
                setNewMatchType(m.typeMatch || '');
                setNewMatchLogoDomicile(m.logoDomicile || '');
                setNewMatchLogoExterieur(m.logoExterieur || '');
                setShowAddMatch(true);
              }}
              onDelete={() => Alert.alert('Supprimer ce match ?', 'Les créneaux de soin associés seront aussi supprimés.', [
                { text: 'Non', style: 'cancel' },
                { text: 'Oui, supprimer', style: 'destructive', onPress: () => { (async () => { try { await api.deleteMatch(pin, m.id); await loadMatches(); } catch { setToast('Erreur, réessaie.'); } })(); } },
              ])}
            />
          ))}

          {activeStatuses.length > 0 && (
            <>
              <Text style={{ color: COLORS.muted, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', marginTop: 22, marginBottom: 10 }}>Récap dispos</Text>
              <View style={styles.summaryRow}>
                {activeStatuses.map((s) => (
                  <TouchableOpacity key={s.key} style={[styles.summaryPill, { borderColor: s.color }]} onPress={() => setSummaryFilter(s)}>
                    <View style={[styles.dot, { backgroundColor: s.color }]} />
                    <Text style={{ color: s.color, fontSize: 11, fontWeight: '700' }}>{s.count} {s.count > 1 ? s.plur : s.sing}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}
        </ScrollView>
        <TouchableOpacity
          style={styles.fab}
          onPress={() => {
            setEditingMatchId(null);
            setNewMatchTitre(''); setNewMatchDate(''); setNewMatchHeure('');
            setNewMatchDomicile(''); setNewMatchExterieur(''); setNewMatchType('');
            setNewMatchLogoDomicile(''); setNewMatchLogoExterieur('');
            setShowAddMatch(true);
          }}
        >
          <Text style={{ color: '#0F1F2E', fontSize: 26, fontWeight: '800' }}>+</Text>
        </TouchableOpacity>
        <SummaryListModal
          visible={!!summaryFilter}
          statut={summaryFilter}
          players={players}
          onClose={() => setSummaryFilter(null)}
          onOpenPlayer={(id) => { setSummaryFilter(null); setMatchDayScreen(null); setSelectedId(id); setTab('infos'); }}
        />
        <Modal visible={showAddMatch} animationType="slide" transparent onRequestClose={() => setShowAddMatch(false)}>
          <View style={styles.sheetOverlay}>
            <KeyboardAvoidingView style={[styles.sheet, { maxHeight: '88%' }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 }}>
                <Text style={styles.heading}>{editingMatchId ? 'MODIFIER LE MATCH' : 'NOUVEAU MATCH'}</Text>
                <TouchableOpacity onPress={() => setShowAddMatch(false)}><Text style={{ color: COLORS.muted, fontSize: 24, padding: 4 }}>✕</Text></TouchableOpacity>
              </View>
              <ScrollView>
                <Text style={styles.fieldLabel}>Équipe à domicile</Text>
                <TextInput style={[styles.field, { marginBottom: 10 }]} placeholder="Ex : Sporting Club Mazamet" placeholderTextColor={COLORS.muted} value={newMatchDomicile} onChangeText={setNewMatchDomicile} />
                <Text style={styles.fieldLabel}>Logo domicile (lien image, optionnel)</Text>
                <TextInput style={[styles.field, { marginBottom: 10 }]} placeholder="https://…" placeholderTextColor={COLORS.muted} value={newMatchLogoDomicile} onChangeText={setNewMatchLogoDomicile} autoCapitalize="none" />

                <Text style={styles.fieldLabel}>Équipe à l'extérieur</Text>
                <TextInput style={[styles.field, { marginBottom: 10 }]} placeholder="Ex : Gruissan" placeholderTextColor={COLORS.muted} value={newMatchExterieur} onChangeText={setNewMatchExterieur} />
                <Text style={styles.fieldLabel}>Logo extérieur (lien image, optionnel)</Text>
                <TextInput style={[styles.field, { marginBottom: 10 }]} placeholder="https://…" placeholderTextColor={COLORS.muted} value={newMatchLogoExterieur} onChangeText={setNewMatchLogoExterieur} autoCapitalize="none" />

                <Text style={styles.fieldLabel}>Date</Text>
                <TextInput style={[styles.field, { marginBottom: 10 }]} placeholder="Dimanche 6 septembre 2026" placeholderTextColor={COLORS.muted} value={newMatchDate} onChangeText={setNewMatchDate} />
                <Text style={styles.fieldLabel}>Heure</Text>
                <TextInput style={[styles.field, { marginBottom: 10 }]} placeholder="15:00" placeholderTextColor={COLORS.muted} value={newMatchHeure} onChangeText={setNewMatchHeure} />

                <Text style={styles.fieldLabel}>Type</Text>
                <View style={{ flexDirection: 'row', gap: 6, marginBottom: 16 }}>
                  <Chip label="Match aller" active={newMatchType === 'Match aller'} onPress={() => setNewMatchType('Match aller')} />
                  <Chip label="Match retour" active={newMatchType === 'Match retour'} onPress={() => setNewMatchType('Match retour')} />
                </View>

                <TouchableOpacity
                  style={styles.btnPrimary}
                  onPress={() => {
                    if (newMatchDomicile.trim() || newMatchExterieur.trim() || newMatchTitre.trim()) {
                      (async () => {
                        try {
                          const data = {
                            titre: newMatchTitre.trim(),
                            equipeDomicile: newMatchDomicile.trim(),
                            equipeExterieur: newMatchExterieur.trim(),
                            date: newMatchDate.trim(),
                            heure: newMatchHeure.trim(),
                            typeMatch: newMatchType,
                            logoDomicile: newMatchLogoDomicile.trim(),
                            logoExterieur: newMatchLogoExterieur.trim(),
                          };
                          if (editingMatchId) {
                            await api.updateMatch(pin, editingMatchId, data);
                          } else {
                            await api.addMatch(pin, data);
                          }
                          await loadMatches();
                          setShowAddMatch(false);
                          setEditingMatchId(null);
                          setNewMatchTitre(''); setNewMatchDate(''); setNewMatchHeure('');
                          setNewMatchDomicile(''); setNewMatchExterieur(''); setNewMatchType('');
                          setNewMatchLogoDomicile(''); setNewMatchLogoExterieur('');
                        } catch { setToast('Erreur, réessaie.'); }
                      })();
                    } else {
                      Alert.alert('Champs manquants', 'Renseigne au moins les deux équipes.');
                    }
                  }}
                >
                  <Text style={styles.btnPrimaryText}>{editingMatchId ? 'Enregistrer' : 'Ajouter'}</Text>
                </TouchableOpacity>
              </ScrollView>
            </KeyboardAvoidingView>
          </View>
        </Modal>
      </SafeAreaView>
    );
  }

  // ---------- PLAYERS LIST SCREEN ----------
  const canEditPlayerGlobal = PLAYER_EDIT_ROLES.includes(role);

  if (showPlayersList) {
    return (
      <SafeAreaView style={styles.shell}>
        <StatusBar barStyle="light-content" />
        <View style={styles.top}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <TouchableOpacity onPress={() => { setShowPlayersList(false); load(pin); }} style={styles.iconBtn}><Text style={{ color: COLORS.text, fontSize: 30, fontWeight: '700' }}>‹</Text></TouchableOpacity>
            <Text style={styles.heading}>LISTE DES JOUEURS</Text>
          </View>
          <Text style={{ fontSize: 12, color: COLORS.muted, marginTop: 6, marginBottom: 14 }}>{players.length} joueur{players.length !== 1 ? 's' : ''} suivi{players.length !== 1 ? 's' : ''}</Text>
          <View style={styles.searchBox}>
            <Text style={{ color: COLORS.muted }}>⌕</Text>
            <TextInput style={styles.searchInput} placeholder="Rechercher un joueur…" placeholderTextColor={COLORS.muted} value={search} onChangeText={setSearch} />
          </View>
        </View>

        <FlatList
          style={{ paddingHorizontal: 18 }}
          data={filtered}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ paddingBottom: 100 }}
          ListEmptyComponent={<Text style={[styles.empty, { textAlign: 'center', marginTop: 20 }]}>{canEditPlayerGlobal ? 'Aucun joueur. Ajoute ton premier joueur avec le bouton +.' : 'Aucun joueur.'}</Text>}
          renderItem={({ item: p }) => {
            const s = statutInfo(p.status);
            const activeSoins = p.soins.filter((x) => x.actif).length;
            return (
              <TouchableOpacity style={[styles.card, { borderLeftColor: s.color }]} onPress={() => { setSelectedId(p.id); setTab('infos'); }}>
                <Avatar player={p} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '700', fontSize: 15, color: COLORS.text }}>{p.name}</Text>
                  <Text style={{ fontSize: 11, color: COLORS.muted }}>
                    {p.poste ? p.poste + ' ' : ''}{activeSoins > 0 ? `· ${activeSoins} soin${activeSoins > 1 ? 's' : ''} en cours` : ''}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <View style={[styles.dot, { backgroundColor: s.color }]} />
                  <Text style={{ fontSize: 11, color: s.color, fontWeight: '700' }}>{s.short}</Text>
                </View>
              </TouchableOpacity>
            );
          }}
        />

        {canEditPlayerGlobal && (
          <TouchableOpacity style={styles.fab} onPress={() => setShowAdd(true)}>
            <Text style={{ color: '#0F1F2E', fontSize: 26, fontWeight: '800' }}>+</Text>
          </TouchableOpacity>
        )}

        {!!toast && <View style={styles.toast}><Text style={{ color: '#fff', fontSize: 12, textAlign: 'center' }}>{toast}</Text></View>}

        <Modal visible={showAdd} animationType="slide" transparent onRequestClose={() => setShowAdd(false)}>
          <View style={styles.sheetOverlay}>
            <KeyboardAvoidingView style={styles.sheet} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 }}>
                <Text style={styles.heading}>NOUVEAU JOUEUR</Text>
                <TouchableOpacity onPress={() => setShowAdd(false)}><Text style={{ color: COLORS.muted, fontSize: 24, padding: 4 }}>✕</Text></TouchableOpacity>
              </View>
              <TextInput style={styles.field} placeholder="Nom du joueur" placeholderTextColor={COLORS.muted} value={newName} onChangeText={setNewName} autoFocus />
              <TextInput style={styles.field} placeholder="Poste (optionnel)" placeholderTextColor={COLORS.muted} value={newPoste} onChangeText={setNewPoste} />
              <Text style={{ color: COLORS.muted, fontSize: 12, marginBottom: 12 }}>Les autres informations (naissance, taille, contact...) se complètent ensuite dans la fiche du joueur.</Text>
              <TouchableOpacity
                style={styles.btnPrimary}
                onPress={() => { if (newName.trim()) { wrap(async () => { await api.addPlayer(pin, newName.trim(), newPoste.trim()); setShowAdd(false); setNewName(''); setNewPoste(''); }); } }}
              >
                <Text style={styles.btnPrimaryText}>Ajouter</Text>
              </TouchableOpacity>
            </KeyboardAvoidingView>
          </View>
        </Modal>
      </SafeAreaView>
    );
  }

  // ---------- MEDECIN BLESSURES SCREEN ----------
  if (medecinBlessuresScreen) {
    const allInjuries = [...ongoingInjuries].sort((a, b) => {
      const da = parseDateFR(a.blessure.date);
      const db = parseDateFR(b.blessure.date);
      if (!da && !db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      return db - da;
    });
    const selected = allInjuries.find(({ blessure: b }) => b.id === medecinSelectedBlessureId);

    return (
      <SafeAreaView style={styles.shell}>
        <StatusBar barStyle="light-content" />
        <View style={styles.detailTop}>
          <TouchableOpacity onPress={() => { setMedecinBlessuresScreen(false); setMedecinSelectedBlessureId(null); }} style={styles.iconBtn}><Text style={{ color: COLORS.text, fontSize: 30, fontWeight: '700' }}>‹</Text></TouchableOpacity>
          <Text style={styles.heading}>BLESSURES</Text>
        </View>
        <ScrollView style={{ padding: 18 }}>
          {allInjuries.length === 0 && <Text style={styles.empty}>Aucune blessure enregistrée.</Text>}
          {allInjuries.map(({ player: p, blessure: b }) => (
            <TouchableOpacity key={b.id} onPress={() => setMedecinSelectedBlessureId(b.id)} style={[styles.entry, { flexDirection: 'column', alignItems: 'stretch', borderLeftColor: '#F0654A' }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={[styles.entryTxt, { fontWeight: '700' }]}>{p.name}</Text>
                <Text style={styles.entryDate}>{b.date}</Text>
              </View>
              <Text style={[styles.entryTxt, { marginTop: 4 }]}>{blessureLabel(b)}{b.diagnostic ? ` · ${b.diagnostic}` : ''}</Text>
              {!!b.avisMedecin && <Text style={{ color: '#3DA9FC', fontSize: 12, marginTop: 4 }}>Avis médical déjà ajouté</Text>}
            </TouchableOpacity>
          ))}
        </ScrollView>

        <BlessureDetailModal
          blessure={selected?.blessure}
          canEdit={false}
          canComment={true}
          onClose={() => setMedecinSelectedBlessureId(null)}
          onDelete={() => {}}
          onEdit={() => {}}
          onMarkFinished={() => {}}
          onSaveAvis={(id, avisMedecin) => wrap(() => api.updateBlessure(pin, id, { avisMedecin }))}
          extraContent={selected && (
            <>
              <Text style={[styles.fieldLabel, { marginBottom: 8 }]}>Fiche joueur (lecture seule)</Text>
              <View style={{ backgroundColor: COLORS.surface2, borderRadius: 8, padding: 10, marginBottom: 16 }}>
                <Text style={{ color: COLORS.text, fontSize: 14, fontWeight: '700', marginBottom: 4 }}>{selected.player.name}</Text>
                {!!selected.player.poste && <Text style={{ color: COLORS.text, fontSize: 13 }}>Poste : {selected.player.poste}</Text>}
                {calcAge(selected.player.birthdate) !== null && <Text style={{ color: COLORS.text, fontSize: 13, marginTop: 2 }}>Âge : {calcAge(selected.player.birthdate)} ans</Text>}
                {!!selected.player.bloodType && <Text style={{ color: COLORS.text, fontSize: 13, marginTop: 2 }}>Groupe sanguin : {selected.player.bloodType}</Text>}
                {!!selected.player.allergies && <Text style={{ color: COLORS.text, fontSize: 13, marginTop: 2 }}>Allergies : {selected.player.allergies}</Text>}
                {!!selected.player.phone && <Text style={{ color: COLORS.text, fontSize: 13, marginTop: 2 }}>Téléphone : {selected.player.phone}</Text>}
              </View>
            </>
          )}
        />
      </SafeAreaView>
    );
  }

  // ---------- ACCOUNTS SCREEN (Administrateur) ----------
  if (showAccountsScreen) {
    if (!accountsLoaded) loadAccounts();
    return (
      <SafeAreaView style={styles.shell}>
        <StatusBar barStyle="light-content" />
        <View style={styles.detailTop}>
          <TouchableOpacity onPress={() => setShowAccountsScreen(false)} style={styles.iconBtn}><Text style={{ color: COLORS.text, fontSize: 30, fontWeight: '700' }}>‹</Text></TouchableOpacity>
          <Text style={styles.heading}>COMPTES</Text>
        </View>
        <ScrollView style={{ padding: 18 }}>
          {accountsList.length === 0 && <Text style={styles.empty}>Aucun compte pour l'instant.</Text>}
          {accountsList.map((u) => (
            <View key={u.id} style={styles.entry}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.entryTxt, { fontWeight: '700' }]}>{u.nom}</Text>
                {!!u.email && <Text style={{ color: COLORS.muted, fontSize: 12, marginTop: 2 }}>{u.email}</Text>}
                <Text style={styles.entryDate}>{u.roles.map((rk) => (ROLES.find((r) => r.key === rk) || {}).label || rk).join(', ')}</Text>
              </View>
              <TouchableOpacity onPress={() => confirmDelete(`Supprimer le compte "${u.nom}" ?`, () => { (async () => { try { await api.deleteUtilisateur(pin, u.id); await loadAccounts(); } catch { setToast('Erreur, réessaie.'); } })(); })}>
                <Text style={{ color: COLORS.muted }}>Suppr.</Text>
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
        <TouchableOpacity style={styles.fab} onPress={() => { setNewAccountNom(''); setNewAccountEmail(''); setNewAccountPassword(''); setNewAccountRoles([]); setShowAddAccount(true); }}>
          <Text style={{ color: '#0F1F2E', fontSize: 26, fontWeight: '800' }}>+</Text>
        </TouchableOpacity>
        {!!toast && <View style={styles.toast}><Text style={{ color: '#fff', fontSize: 12, textAlign: 'center' }}>{toast}</Text></View>}

        <Modal visible={showAddAccount} animationType="slide" transparent onRequestClose={() => setShowAddAccount(false)}>
          <View style={styles.sheetOverlay}>
            <KeyboardAvoidingView style={[styles.sheet, { maxHeight: '85%' }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 }}>
                <Text style={styles.heading}>NOUVEAU COMPTE</Text>
                <TouchableOpacity onPress={() => setShowAddAccount(false)}><Text style={{ color: COLORS.muted, fontSize: 24, padding: 4 }}>✕</Text></TouchableOpacity>
              </View>
              <ScrollView>
                <TextInput style={styles.field} placeholder="Nom et prénom" placeholderTextColor={COLORS.muted} value={newAccountNom} onChangeText={setNewAccountNom} autoCapitalize="words" />
                <TextInput style={styles.field} placeholder="Adresse mail" placeholderTextColor={COLORS.muted} value={newAccountEmail} onChangeText={setNewAccountEmail} autoCapitalize="none" keyboardType="email-address" />
                <TextInput style={styles.field} placeholder="Mot de passe" placeholderTextColor={COLORS.muted} value={newAccountPassword} onChangeText={setNewAccountPassword} secureTextEntry />
                <Text style={styles.fieldLabel}>Profils accessibles</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 16, marginTop: 6 }}>
                  {ROLES.map((r) => (
                    <Chip
                      key={r.key}
                      label={r.label}
                      active={newAccountRoles.includes(r.key)}
                      onPress={() => setNewAccountRoles((prev) => prev.includes(r.key) ? prev.filter((x) => x !== r.key) : [...prev, r.key])}
                    />
                  ))}
                </View>
                <TouchableOpacity
                  style={styles.btnPrimary}
                  onPress={() => {
                    if (!newAccountNom.trim() || !newAccountEmail.trim() || !newAccountPassword.trim() || newAccountRoles.length === 0) {
                      Alert.alert('Champs manquants', 'Renseigne un nom, un email, un mot de passe et au moins un profil.');
                      return;
                    }
                    (async () => {
                      try {
                        await api.addUtilisateur(pin, newAccountNom.trim(), newAccountEmail.trim(), newAccountPassword.trim(), newAccountRoles);
                        setShowAddAccount(false);
                        await loadAccounts();
                      } catch {
                        Alert.alert('Erreur', 'Cet email existe peut-être déjà.');
                      }
                    })();
                  }}
                >
                  <Text style={styles.btnPrimaryText}>Créer le compte</Text>
                </TouchableOpacity>
              </ScrollView>
            </KeyboardAvoidingView>
          </View>
        </Modal>
      </SafeAreaView>
    );
  }

  // ---------- HOME MENU ----------
  const canQuickAddBlessure = BLESSURE_EDIT_ROLES.includes(role);
  const roleLabel = (ROLES.find((r) => r.key === role) || {}).label || '';
  const bellCount = unseenNotifCount;

  // ---------- NOTIFICATIONS SCREEN ----------
  if (showNotifScreen) {
    if (!activitesLoaded) loadActivites();
    return (
      <SafeAreaView style={styles.shell}>
        <StatusBar barStyle="light-content" />
        <View style={styles.detailTop}>
          <TouchableOpacity onPress={() => setShowNotifScreen(false)} style={styles.iconBtn}><Text style={{ color: COLORS.text, fontSize: 30, fontWeight: '700' }}>‹</Text></TouchableOpacity>
          <Text style={styles.heading}>NOTIFICATIONS</Text>
        </View>
        <ScrollView style={{ padding: 18 }}>
          {relevantActivites.length === 0 && <Text style={styles.empty}>Aucune notification pour l'instant.</Text>}
          {relevantActivites.map((a) => {
            const isNew = !notifLastSeen || new Date(a.createdAt) > new Date(notifLastSeen);
            const roleLbl = (ROLES.find((r) => r.key === a.role) || {}).label || a.role;
            return (
              <View key={a.id} style={[styles.entry, isNew && { borderLeftColor: '#3DA9FC' }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.entryTxt}>{a.label}</Text>
                  <Text style={styles.entryDate}>{roleLbl} · {new Date(a.createdAt).toLocaleString('fr-FR')}</Text>
                </View>
              </View>
            );
          })}
        </ScrollView>
        {unseenNotifCount > 0 && (
          <TouchableOpacity style={[styles.btnPrimary, { margin: 18 }]} onPress={markNotifsSeen}>
            <Text style={styles.btnPrimaryText}>Marquer tout comme vu</Text>
          </TouchableOpacity>
        )}
        {!!toast && <View style={styles.toast}><Text style={{ color: '#fff', fontSize: 12, textAlign: 'center' }}>{toast}</Text></View>}
      </SafeAreaView>
    );
  }

  if (role === 'medecin') {
    const dispoCount = players.filter((p) => p.status === 'disponible').length;
    const indispoCount = players.filter((p) => p.status === 'indisponible').length;
    const newInjuries = ongoingInjuries
      .filter(({ blessure: b }) => b.createdAt && (!medecinLastSeen || new Date(b.createdAt) > new Date(medecinLastSeen)))
      .sort((a, b) => new Date(b.blessure.createdAt) - new Date(a.blessure.createdAt));

    return (
      <SafeAreaView style={styles.shell}>
        <StatusBar barStyle="light-content" />
        <ScrollView style={styles.top} contentContainerStyle={{ paddingBottom: 110 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View>
              <Text style={[styles.heading, { fontSize: 17 }]}>MÉDIXV</Text>
              <Text style={{ color: COLORS.muted, fontSize: 12, marginTop: 2 }}>Médecin – Dashboard</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <TouchableOpacity onPress={openProfileMenu}>
                <Text style={{ color: '#3DA9FC', fontSize: 12, textDecorationLine: 'underline' }}>Menu</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.iconRoundBtn} onPress={() => { setActivitesLoaded(false); setShowNotifScreen(true); }}>
                <Text style={{ color: COLORS.text, fontSize: 16 }}>🔔</Text>
                {bellCount > 0 && <View style={styles.bellBadge}><Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>{bellCount > 9 ? '9+' : bellCount}</Text></View>}
              </TouchableOpacity>
            </View>
          </View>

          {newInjuries.length > 0 && (
            <TouchableOpacity style={[styles.alertBanner, { marginTop: 16, flexDirection: 'row', alignItems: 'center' }]} onPress={markBlessuresSeen}>
              <Text style={{ fontSize: 18, marginRight: 10 }}>⚠</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#F0654A', fontWeight: '800', fontSize: 14 }}>{newInjuries.length} nouvelle{newInjuries.length > 1 ? 's' : ''} blessure{newInjuries.length > 1 ? 's' : ''} à consulter</Text>
                <Text style={{ color: COLORS.muted, fontSize: 11, marginTop: 2 }}>Tape pour marquer comme vues</Text>
              </View>
              <Text style={{ color: COLORS.muted, fontSize: 16 }}>›</Text>
            </TouchableOpacity>
          )}

          <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
            <View style={[styles.statPill, { borderColor: '#52D17C55' }]}>
              <View style={[styles.dot, { backgroundColor: '#52D17C' }]} />
              <Text style={{ color: COLORS.text, fontWeight: '700', fontSize: 13 }}>{dispoCount} disponibles</Text>
            </View>
            <View style={[styles.statPill, { borderColor: '#F0654A55' }]}>
              <View style={[styles.dot, { backgroundColor: '#F0654A' }]} />
              <Text style={{ color: COLORS.text, fontWeight: '700', fontSize: 13 }}>{indispoCount} indisponibles</Text>
            </View>
          </View>
          <View style={[styles.statPill, { borderColor: COLORS.border, marginTop: 8, alignSelf: 'flex-start' }]}>
            <Text style={{ color: COLORS.muted, fontSize: 11 }}>Effectif total</Text>
            <Text style={{ color: COLORS.text, fontWeight: '800', fontSize: 13, marginLeft: 6 }}>{players.length} joueurs</Text>
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 24, marginBottom: 10 }}>
            <Text style={{ color: COLORS.muted, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' }}>Nouvelles blessures</Text>
            <Text style={{ color: COLORS.muted, fontSize: 11 }}>{newInjuries.length}</Text>
          </View>
          {newInjuries.length === 0 && <Text style={styles.empty}>Aucune nouvelle blessure pour l'instant.</Text>}
          {newInjuries.map(({ player: p, blessure: b }) => {
            const s = statutInfo(p.status);
            return (
              <TouchableOpacity key={b.id} style={styles.injuryRow} onPress={() => { setMedecinBlessuresScreen(true); setMedecinSelectedBlessureId(b.id); }}>
                <Avatar player={p} size={38} />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={{ color: COLORS.text, fontWeight: '700', fontSize: 14 }} numberOfLines={1}>{p.name}</Text>
                    <View style={styles.newTag}><Text style={{ color: '#F0654A', fontSize: 9, fontWeight: '800' }}>NOUVELLE</Text></View>
                  </View>
                  <Text style={{ color: COLORS.muted, fontSize: 11, marginTop: 3 }} numberOfLines={1}>
                    {blessureLabel(b)}{b.contexte ? ` · ${b.contexte}` : ''}{b.diagnostic ? ` · ${b.diagnostic}` : ''}{b.douleur ? ` · Douleur ${b.douleur}/10` : ''}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ color: s.color, fontSize: 11, fontWeight: '700' }}>{s.short}</Text>
                  {!!b.date && <Text style={{ color: COLORS.muted, fontSize: 10, marginTop: 2 }}>{b.date}</Text>}
                </View>
              </TouchableOpacity>
            );
          })}

          <Text style={{ color: COLORS.muted, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', marginTop: 22, marginBottom: 10 }}>Actions rapides</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            <TouchableOpacity style={styles.quickAction} onPress={() => setMedecinBlessuresScreen(true)}>
              <View style={[styles.quickActionCircle, { backgroundColor: '#3DA9FC22' }]}><Text style={{ color: '#3DA9FC', fontSize: 18 }}>🩹</Text></View>
              <Text style={styles.quickActionText}>Blessures</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.quickAction} onPress={() => setShowPlayersList(true)}>
              <View style={[styles.quickActionCircle, { backgroundColor: '#3DA9FC22' }]}><Text style={{ color: '#3DA9FC', fontSize: 18 }}>👤</Text></View>
              <Text style={styles.quickActionText}>Voir un{'\n'}joueur</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.quickAction} onPress={() => Alert.alert('Bientôt disponible', 'Cette fonctionnalité sera développée prochainement.')}>
              <View style={[styles.quickActionCircle, { backgroundColor: COLORS.surface3 }]}><Text style={{ color: COLORS.muted, fontSize: 18 }}>📋</Text></View>
              <Text style={styles.quickActionText}>Consultation</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.quickAction} onPress={() => Alert.alert('Bientôt disponible', 'Cette fonctionnalité sera développée prochainement.')}>
              <View style={[styles.quickActionCircle, { backgroundColor: COLORS.surface3 }]}><Text style={{ color: COLORS.muted, fontSize: 18 }}>📅</Text></View>
              <Text style={styles.quickActionText}>Agenda{'\n'}médical</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>

        <View style={styles.navBar}>
          <TouchableOpacity style={styles.navItem}>
            <Text style={{ fontSize: 18 }}>🏠</Text>
            <Text style={[styles.navItemText, { color: '#3DA9FC' }]}>Accueil</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navItem} onPress={() => setShowPlayersList(true)}>
            <Text style={{ fontSize: 18 }}>👥</Text>
            <Text style={styles.navItemText}>Joueurs</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navItem} onPress={() => setMedecinBlessuresScreen(true)}>
            <Text style={{ fontSize: 18 }}>🩹</Text>
            <Text style={styles.navItemText}>Blessures</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navItem} onPress={() => Alert.alert('Bientôt disponible', 'Cette fonctionnalité sera développée prochainement.')}>
            <Text style={{ fontSize: 18 }}>📋</Text>
            <Text style={styles.navItemText}>Consult.</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navItem} onPress={() => Alert.alert('Bientôt disponible', 'Cette fonctionnalité sera développée prochainement.')}>
            <Text style={{ fontSize: 18 }}>📊</Text>
            <Text style={styles.navItemText}>Stats</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navItem} onPress={changeProfile}>
            <Text style={{ fontSize: 18 }}>⋯</Text>
            <Text style={styles.navItemText}>Plus</Text>
          </TouchableOpacity>
        </View>

        {!!toast && <View style={styles.toast}><Text style={{ color: '#fff', fontSize: 12, textAlign: 'center' }}>{toast}</Text></View>}
        <ProfileMenuModal
          visible={showProfileMenu}
          onClose={() => setShowProfileMenu(false)}
          onChangeProfile={changeProfile}
          onLogout={logoutAccount}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.shell}>
      <StatusBar barStyle="light-content" />
      <ScrollView style={styles.top} contentContainerStyle={{ paddingBottom: 110 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <TouchableOpacity onPress={openProfileMenu} style={styles.iconRoundBtn}>
            <Text style={{ color: COLORS.text, fontSize: 18 }}>☰</Text>
          </TouchableOpacity>
          <Text style={[styles.heading, { fontSize: 15 }]}>MÉDIXV</Text>
          <TouchableOpacity style={styles.iconRoundBtn} onPress={() => { setActivitesLoaded(false); setShowNotifScreen(true); }}>
            <Text style={{ color: COLORS.text, fontSize: 18 }}>🔔</Text>
            {bellCount > 0 && (
              <View style={styles.bellBadge}><Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>{bellCount > 9 ? '9+' : bellCount}</Text></View>
            )}
          </TouchableOpacity>
        </View>

        <Text style={{ color: COLORS.text, fontSize: 22, fontWeight: '800', marginTop: 18 }}>Bonjour</Text>
        <Text style={{ color: COLORS.muted, fontSize: 13, marginTop: 2, marginBottom: 16 }}>Espace {roleLabel.toLowerCase()}</Text>

        <TouchableOpacity style={styles.searchBar} onPress={() => setShowPlayersList(true)}>
          <Text style={{ color: COLORS.muted }}>⌕</Text>
          <Text style={{ color: COLORS.muted, fontSize: 13, marginLeft: 8 }}>Rechercher un joueur</Text>
        </TouchableOpacity>

        {activeStatuses.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginTop: 16 }}>
            {activeStatuses.map((s) => {
              const pct = players.length > 0 ? Math.round((s.count / players.length) * 100) : 0;
              return (
                <TouchableOpacity key={s.key} style={[styles.statCard, { borderColor: s.color + '55' }]} onPress={() => setSummaryFilter(s)}>
                  <View style={[styles.statIconCircle, { backgroundColor: s.color }]}>
                    <Text style={{ color: '#0F1F2E', fontWeight: '800', fontSize: 13 }}>{STATUS_ICON[s.key] || '•'}</Text>
                  </View>
                  <Text style={{ color: COLORS.text, fontWeight: '800', fontSize: 20, marginTop: 8 }}>{s.count}</Text>
                  <Text style={{ color: COLORS.muted, fontSize: 11, marginTop: 2 }} numberOfLines={1}>{s.short}</Text>
                  <Text style={{ color: COLORS.muted, fontSize: 10, marginTop: 6 }}>{pct}% de l'effectif</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {(() => {
          const enRetourTerrain = ongoingInjuries.filter(({ blessure: b }) => b.phase && b.phase !== 'blessure');
          if (enRetourTerrain.length === 0) return null;
          return (
            <View style={{ marginTop: 22 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <Text style={{ color: COLORS.muted, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' }}>Retour terrain</Text>
                <Text style={{ color: COLORS.muted, fontSize: 11 }}>{enRetourTerrain.length}</Text>
              </View>
              {enRetourTerrain.map(({ player: p, blessure: b }) => {
                const j = daysSince(b.date);
                const ph = PHASES.find((x) => x.key === b.phase) || PHASES[0];
                return (
                  <TouchableOpacity
                    key={b.id}
                    style={[styles.injuryRow, { flexDirection: 'column', alignItems: 'stretch' }]}
                    onPress={() => { setSelectedId(p.id); setTab('medical'); setMedicalSub('blessures'); setSelectedBlessureId(b.id); }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Avatar player={p} size={38} />
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={{ color: COLORS.text, fontWeight: '700', fontSize: 14 }} numberOfLines={1}>{p.name}</Text>
                        <Text style={{ color: COLORS.muted, fontSize: 11, marginTop: 2 }} numberOfLines={1}>{blessureLabel(b)}{j !== null ? ` · J+${j}` : ''}</Text>
                      </View>
                      {!!b.prochaineEtapeLabel && (
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={{ color: COLORS.muted, fontSize: 10 }}>Prochaine étape</Text>
                          <Text style={{ color: ph.color, fontSize: 12, fontWeight: '700' }}>{b.prochaineEtapeDate || b.prochaineEtapeLabel}</Text>
                        </View>
                      )}
                    </View>
                    <View style={{ marginTop: 4 }}>
                      <Text style={{ color: ph.color, fontSize: 11, fontWeight: '800' }}>{ph.label.toUpperCase()}</Text>
                      <PhaseTrack current={b.phase} />
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          );
        })()}

        {ongoingInjuries.length > 0 && (
          <View style={{ marginTop: 22 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <Text style={{ color: COLORS.muted, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' }}>Blessures en cours</Text>
              <Text style={{ color: COLORS.muted, fontSize: 11 }}>{ongoingInjuries.length}</Text>
            </View>
            {ongoingInjuries.map(({ player: p, blessure: b }) => {
              const s = statutInfo(p.status);
              const j = daysSince(b.date);
              return (
                <TouchableOpacity
                  key={b.id}
                  style={styles.injuryRow}
                  onPress={() => { setSelectedId(p.id); setTab('medical'); setMedicalSub('blessures'); }}
                >
                  <Avatar player={p} size={38} />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={{ color: COLORS.text, fontWeight: '700', fontSize: 14 }} numberOfLines={1}>{p.name}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 }}>
                      <View style={[styles.dot, { backgroundColor: s.color }]} />
                      <Text style={{ color: COLORS.muted, fontSize: 11 }} numberOfLines={1}>{blessureLabel(b)} · {s.short}</Text>
                    </View>
                  </View>
                  {j !== null && (
                    <View style={styles.jBadge}><Text style={{ color: COLORS.muted, fontSize: 11, fontWeight: '700' }}>J+{j}</Text></View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        <Text style={{ color: COLORS.muted, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', marginTop: 22, marginBottom: 10 }}>Actions rapides</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          {canQuickAddBlessure && (
            <TouchableOpacity style={styles.quickAction} onPress={() => setShowQuickBlessure(true)}>
              <View style={[styles.quickActionCircle, { backgroundColor: '#F0654A22' }]}><Text style={{ color: '#F0654A', fontSize: 20, fontWeight: '800' }}>+</Text></View>
              <Text style={styles.quickActionText}>Nouvelle{'\n'}blessure</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.quickAction} onPress={() => setShowPlayersList(true)}>
            <View style={[styles.quickActionCircle, { backgroundColor: '#3DA9FC22' }]}><Text style={{ color: '#3DA9FC', fontSize: 18 }}>👤</Text></View>
            <Text style={styles.quickActionText}>Voir un{'\n'}joueur</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickAction} onPress={() => { setMatchDayScreen('list'); loadMatches(); }}>
            <View style={[styles.quickActionCircle, { backgroundColor: '#F5B94222' }]}><Text style={{ color: '#F5B942', fontSize: 18 }}>📅</Text></View>
            <Text style={styles.quickActionText}>Jour de{'\n'}match</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickAction} onPress={() => Alert.alert('Bientôt disponible', 'Cette fonctionnalité sera développée prochainement.')}>
            <View style={[styles.quickActionCircle, { backgroundColor: COLORS.surface3 }]}><Text style={{ color: COLORS.muted, fontSize: 18 }}>💊</Text></View>
            <Text style={styles.quickActionText}>Pharmacie</Text>
          </TouchableOpacity>
          {role === 'administrateur' && (
            <TouchableOpacity style={styles.quickAction} onPress={() => { setAccountsLoaded(false); setShowAccountsScreen(true); }}>
              <View style={[styles.quickActionCircle, { backgroundColor: '#9B7EDE22' }]}><Text style={{ color: '#9B7EDE', fontSize: 18 }}>🔑</Text></View>
              <Text style={styles.quickActionText}>Comptes</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      <View style={styles.navBar}>
        <TouchableOpacity style={styles.navItem}>
          <Text style={{ fontSize: 18 }}>🏠</Text>
          <Text style={[styles.navItemText, { color: '#3DA9FC' }]}>Accueil</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => setShowPlayersList(true)}>
          <Text style={{ fontSize: 18 }}>👥</Text>
          <Text style={styles.navItemText}>Joueurs</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => Alert.alert('Bientôt disponible', 'Cette fonctionnalité sera développée prochainement.')}>
          <Text style={{ fontSize: 18 }}>🩹</Text>
          <Text style={styles.navItemText}>Soins</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => Alert.alert('Bientôt disponible', 'Cette fonctionnalité sera développée prochainement.')}>
          <Text style={{ fontSize: 18 }}>💊</Text>
          <Text style={styles.navItemText}>Pharmacie</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={changeProfile}>
          <Text style={{ fontSize: 18 }}>⋯</Text>
          <Text style={styles.navItemText}>Plus</Text>
        </TouchableOpacity>
      </View>

      {!!toast && <View style={styles.toast}><Text style={{ color: '#fff', fontSize: 12, textAlign: 'center' }}>{toast}</Text></View>}

      <SummaryListModal
        visible={!!summaryFilter}
        statut={summaryFilter}
        players={players}
        onClose={() => setSummaryFilter(null)}
        onOpenPlayer={(id) => { setSummaryFilter(null); setSelectedId(id); setTab('infos'); }}
      />

      <QuickBlessureFlow
        visible={showQuickBlessure}
        players={players}
        role={role}
        onClose={() => setShowQuickBlessure(false)}
        onSave={(playerId, data) => {
          const { newStatus, ...blessureData } = data;
          setShowQuickBlessure(false);
          wrap(async () => {
            await api.addBlessure(pin, playerId, blessureData);
            await api.updatePlayer(pin, playerId, { status: newStatus || 'indisponible' });
          });
        }}
      />
      <StatusPickerModal
        visible={!!pendingBlessurePlayerId}
        current="indisponible"
        subtitle="Quelle est la disponibilité du joueur suite à cette blessure ?"
        onClose={() => setPendingBlessurePlayerId(null)}
        onSelect={(key) => {
          const pid = pendingBlessurePlayerId;
          setPendingBlessurePlayerId(null);
          wrap(() => api.updatePlayer(pin, pid, { status: key }));
        }}
      />
      <ProfileMenuModal
        visible={showProfileMenu}
        onClose={() => setShowProfileMenu(false)}
        onChangeProfile={changeProfile}
        onLogout={logoutAccount}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  roleBtn: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, paddingVertical: 14, paddingHorizontal: 16, alignItems: 'center' },
  heading: { fontWeight: '800', letterSpacing: 1, color: COLORS.text, fontSize: 18 },
  pinInput: { fontSize: 22, letterSpacing: 8, textAlign: 'center', width: 160, backgroundColor: COLORS.surface2, borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, padding: 12, color: COLORS.text, marginVertical: 16 },
  btnPrimary: { backgroundColor: '#3DA9FC', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  btnPrimaryText: { color: '#0F1F2E', fontWeight: '800', fontSize: 14 },
  top: { padding: 18, paddingTop: 8 },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.surface2, borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 },
  summaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  summaryPill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 },
  injuryCard: { width: 130, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, padding: 10 },
  alertBanner: { backgroundColor: '#F0654A18', borderWidth: 1, borderColor: '#F0654A', borderRadius: 10, padding: 12, marginBottom: 14 },
  menuBtn: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, paddingVertical: 16, paddingHorizontal: 16, alignItems: 'center' },
  iconRoundBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: COLORS.surface2, alignItems: 'center', justifyContent: 'center' },
  bellBadge: { position: 'absolute', top: -2, right: -2, backgroundColor: '#F0654A', borderRadius: 9, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface2, borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
  statCard: { width: 92, backgroundColor: COLORS.surface, borderWidth: 1, borderRadius: 12, padding: 12, alignItems: 'flex-start' },
  phaseDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: COLORS.border, backgroundColor: COLORS.surface2, alignItems: 'center', justifyContent: 'center' },
  phaseLine: { height: 2, flex: 1, backgroundColor: COLORS.border },
  statPill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.surface, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  newTag: { backgroundColor: '#F0654A22', borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2 },
  statIconCircle: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  injuryRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, padding: 12, marginBottom: 8 },
  jBadge: { backgroundColor: COLORS.surface2, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  quickAction: { width: '22%', alignItems: 'center' },
  quickActionCircle: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  quickActionText: { color: COLORS.text, fontSize: 11, textAlign: 'center', marginTop: 6, lineHeight: 14 },
  navBar: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', backgroundColor: COLORS.surface, borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 10, paddingBottom: 24 },
  navItem: { flex: 1, alignItems: 'center' },
  navItemText: { color: COLORS.muted, fontSize: 10, marginTop: 3, fontWeight: '600' },
  menuBtnText: { color: COLORS.text, fontWeight: '700', fontSize: 15 },
  menuBtnDisabled: { opacity: 0.6 },
  searchInput: { flex: 1, color: COLORS.text, fontSize: 14 },
  card: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderLeftWidth: 4, borderRadius: 10, padding: 13, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  fab: { position: 'absolute', bottom: 24, right: 20, width: 52, height: 52, borderRadius: 26, backgroundColor: '#3DA9FC', alignItems: 'center', justifyContent: 'center' },
  toast: { position: 'absolute', bottom: 88, left: 18, right: 18, backgroundColor: '#F0654A', borderRadius: 8, padding: 10 },
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: COLORS.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 20, maxHeight: '85%' },
  field: { backgroundColor: COLORS.surface2, borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, padding: 11, color: COLORS.text, fontSize: 14, marginBottom: 10 },
  detailTop: { padding: 18, borderBottomWidth: 1, borderBottomColor: COLORS.border, flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconBtn: { padding: 4 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1 },
  statusRow2: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, marginBottom: 8 },
  tabs: { flexDirection: 'row', gap: 4, paddingHorizontal: 18, paddingTop: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  tab: { flex: 1, alignItems: 'center', paddingBottom: 10, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: '#3DA9FC' },
  tabContent: { padding: 18 },
  fieldLabel: { color: COLORS.muted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', marginBottom: 6 },
  fieldInput: { backgroundColor: COLORS.surface2, borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, padding: 10, color: COLORS.text, fontSize: 14 },
  inlineAdd: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  inlineInput: { flex: 1, backgroundColor: COLORS.surface2, borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, padding: 10, color: COLORS.text, fontSize: 14 },
  inlineBtn: { backgroundColor: '#3DA9FC', borderRadius: 8, width: 40, alignItems: 'center', justifyContent: 'center' },
  inlineBtnText: { color: '#0F1F2E', fontWeight: '800', fontSize: 18 },
  entry: { backgroundColor: COLORS.surface2, borderWidth: 1, borderColor: COLORS.border, borderLeftWidth: 3, borderLeftColor: COLORS.surface3, borderRadius: 8, padding: 10, marginBottom: 8, flexDirection: 'row', gap: 8 },
  entryTxt: { fontSize: 14, color: COLORS.text, lineHeight: 19 },
  entryDate: { fontSize: 11, color: COLORS.muted, marginTop: 4 },
  empty: { color: COLORS.muted, fontSize: 13 },
  subheading: { fontSize: 11, color: COLORS.muted, marginVertical: 8, fontWeight: '800', textTransform: 'uppercase' },
  subTabRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  subTabBtn: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border },
  subTabBtnActive: { backgroundColor: '#3DA9FC', borderColor: '#3DA9FC' },
  chip: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface2 },
  painDot: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface2, alignItems: 'center', justifyContent: 'center' },
  chipActive: { backgroundColor: '#3DA9FC', borderColor: '#3DA9FC' },
  tag: { backgroundColor: COLORS.surface3, borderRadius: 6, paddingVertical: 3, paddingHorizontal: 8 },
  tagText: { color: COLORS.muted, fontSize: 11, fontWeight: '600' },
});

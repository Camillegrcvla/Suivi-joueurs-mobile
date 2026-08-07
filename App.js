import { useEffect, useState } from 'react';
import {
  SafeAreaView, View, Text, TextInput, TouchableOpacity, FlatList, Image,
  ScrollView, StyleSheet, StatusBar, Modal, KeyboardAvoidingView, Platform, Alert, BackHandler,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, today, calcAge } from './api';

const COLORS = {
  bg: '#0F1F2E', surface: '#16304A', surface2: '#1D3D5C', surface3: '#26507A',
  text: '#F2F6FA', muted: '#9FB4C7', border: 'rgba(242,246,250,0.10)',
};
const ACCENT = '#3DA9FC';

const STATUTS = [
  { key: 'disponible', label: 'Disponible', short: 'Disponible', color: '#52D17C', sing: 'disponible', plur: 'disponibles' },
  { key: 'disponible_adaptation', label: 'Disponible avec adaptation', short: 'Adapté', color: '#A9D14E', sing: 'disponible (adaptation)', plur: 'disponibles (adaptation)' },
  { key: 'attente_bilan', label: 'Attente bilan', short: 'Bilan', color: '#F5B942', sing: 'en attente de bilan', plur: 'en attente de bilan' },
  { key: 'protocole_commotion', label: 'Protocole commotion', short: 'Commotion', color: '#F2994A', sing: 'en protocole commotion', plur: 'en protocole commotion' },
  { key: 'retour_terrain', label: 'Retour terrain', short: 'Retour', color: '#56C2E0', sing: 'en retour terrain', plur: 'en retour terrain' },
  { key: 'suspendu', label: 'Suspendu', short: 'Suspendu', color: '#9B7EDE', sing: 'suspendu', plur: 'suspendus' },
  { key: 'indisponible', label: 'Indisponible', short: 'Indispo', color: '#F0654A', sing: 'indisponible', plur: 'indisponibles' },
];
const PRIORITY_ORDER = STATUTS.map((s) => s.key);
const statutInfo = (key) => STATUTS.find((s) => s.key === key) || STATUTS[0];
const initials = (name) => name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

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

function StatusBadge({ status, onPress }) {
  const s = statutInfo(status);
  return (
    <TouchableOpacity onPress={onPress} style={[styles.statusBadge, { borderColor: s.color, backgroundColor: s.color + '22' }]}>
      <View style={[styles.dot, { backgroundColor: s.color }]} />
      <Text style={{ color: s.color, fontWeight: '700', fontSize: 13 }}>{s.label}</Text>
      <Text style={{ color: s.color, fontSize: 11, marginLeft: 4 }}>▾</Text>
    </TouchableOpacity>
  );
}

function StatusPickerModal({ visible, current, onSelect, onClose }) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.sheetOverlay}>
        <View style={styles.sheet}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 }}>
            <Text style={styles.heading}>STATUT</Text>
            <TouchableOpacity onPress={onClose}><Text style={{ color: COLORS.muted }}>✕</Text></TouchableOpacity>
          </View>
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
        </View>
      </View>
    </Modal>
  );
}

function InfoField({ label, value, onSave, keyboardType, multiline }) {
  const [val, setVal] = useState(value || '');
  useEffect(() => { setVal(value || ''); }, [value]);
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
            <TouchableOpacity onPress={onClose}><Text style={{ color: COLORS.muted }}>✕</Text></TouchableOpacity>
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
  { key: 'preparateur', label: 'Préparateur physique' },
  { key: 'entraineur', label: 'Entraîneur' },
  { key: 'joueur', label: 'Joueur' },
  { key: 'administrateur', label: 'Administrateur' },
];

const MECANISMES = ['Plaquage', 'Mêlée', 'Course', 'Musculation'];
const COTES = ['Gauche', 'Droit', 'Non concerné'];
const ZONES = ['Tête', 'Cou', 'Épaule', 'Bras', 'Coude', 'Poignet', 'Main/Doigt', 'Thorax/Côtes', 'Dos', 'Abdomen', 'Hanche', 'Cuisse', 'Genou', 'Mollet', 'Cheville', 'Pied/Orteil'];
const DIAGNOSTICS = ['Entorse', 'Élongation', 'Claquage', 'Déchirure musculaire', 'Contusion', 'Fracture', 'Luxation', 'Tendinite', 'Rupture ligamentaire', 'Commotion cérébrale', 'Plaie', 'Autre'];

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

function BlessureFormModal({ visible, onClose, onSave }) {
  const [date, setDate] = useState('');
  const [zone, setZone] = useState('');
  const [cote, setCote] = useState('');
  const [diagnostic, setDiagnostic] = useState('');
  const [diagnosticAutre, setDiagnosticAutre] = useState('');
  const [mecanisme, setMecanisme] = useState('');
  const [imagerie, setImagerie] = useState(false);
  const [imagerieDate, setImagerieDate] = useState('');

  const reset = () => { setDate(''); setZone(''); setCote(''); setDiagnostic(''); setDiagnosticAutre(''); setMecanisme(''); setImagerie(false); setImagerieDate(''); };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.sheetOverlay}>
        <KeyboardAvoidingView style={[styles.sheet, { maxHeight: '88%' }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 }}>
            <Text style={styles.heading}>NOUVELLE BLESSURE</Text>
            <TouchableOpacity onPress={() => { reset(); onClose(); }}><Text style={{ color: COLORS.muted }}>✕</Text></TouchableOpacity>
          </View>
          <ScrollView>
            <Text style={styles.fieldLabel}>Date (JJ/MM/AAAA)</Text>
            <TextInput style={[styles.field, { marginBottom: 12 }]} value={date} onChangeText={(t) => setDate(formatDateInput(t))} placeholder="—" placeholderTextColor={COLORS.muted} keyboardType="number-pad" maxLength={10} />

            <Text style={styles.fieldLabel}>Zone du corps</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              {ZONES.map((z) => <Chip key={z} label={z} active={zone === z} onPress={() => setZone(z)} />)}
            </View>

            <Text style={styles.fieldLabel}>Côté</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              {COTES.map((c) => <Chip key={c} label={c} active={cote === c} onPress={() => setCote(c)} />)}
            </View>

            <Text style={styles.fieldLabel}>Diagnostic</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              {DIAGNOSTICS.map((d) => <Chip key={d} label={d} active={diagnostic === d} onPress={() => setDiagnostic(d)} />)}
            </View>
            {diagnostic === 'Autre' && (
              <TextInput style={[styles.field, { marginBottom: 12 }]} value={diagnosticAutre} onChangeText={setDiagnosticAutre} placeholder="Préciser le diagnostic…" placeholderTextColor={COLORS.muted} />
            )}

            <Text style={styles.fieldLabel}>Mécanisme de la blessure</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              {MECANISMES.map((m) => <Chip key={m} label={m} active={mecanisme === m} onPress={() => setMecanisme(m)} />)}
            </View>

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

            <Text style={{ color: COLORS.muted, fontSize: 12, marginBottom: 12 }}>L'ajout de photos ou de compte-rendu d'examen arrive dans une prochaine mise à jour. Dès l'enregistrement, le statut du joueur passera automatiquement à « Indisponible ».</Text>

            <TouchableOpacity
              style={styles.btnPrimary}
              onPress={() => {
                const finalDiagnostic = diagnostic === 'Autre' ? diagnosticAutre : diagnostic;
                onSave({ date, zone, cote, diagnostic: finalDiagnostic, mecanisme, imagerie, imagerieDate });
                reset();
              }}
            >
              <Text style={styles.btnPrimaryText}>Enregistrer la blessure</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function BlessureDetailModal({ blessure, onClose, onDelete }) {
  if (!blessure) return null;
  const b = blessure;
  return (
    <Modal visible={!!blessure} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.sheetOverlay}>
        <View style={[styles.sheet, { maxHeight: '80%' }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 }}>
            <Text style={styles.heading}>{blessureLabel(b).toUpperCase()}</Text>
            <TouchableOpacity onPress={onClose}><Text style={{ color: COLORS.muted }}>✕</Text></TouchableOpacity>
          </View>
          <ScrollView>
            {!!b.date && (
              <View style={{ marginBottom: 12 }}>
                <Text style={styles.fieldLabel}>Date</Text>
                <Text style={{ color: COLORS.text, fontSize: 14 }}>{b.date}</Text>
              </View>
            )}
            {!!b.diagnostic && (
              <View style={{ marginBottom: 12 }}>
                <Text style={styles.fieldLabel}>Diagnostic</Text>
                <Text style={{ color: COLORS.text, fontSize: 14 }}>{b.diagnostic}</Text>
              </View>
            )}
            {!!b.mecanisme && (
              <View style={{ marginBottom: 12 }}>
                <Text style={styles.fieldLabel}>Mécanisme</Text>
                <Text style={{ color: COLORS.text, fontSize: 14 }}>{b.mecanisme}</Text>
              </View>
            )}
            <View style={{ marginBottom: 12 }}>
              <Text style={styles.fieldLabel}>Imagerie</Text>
              <Text style={{ color: COLORS.text, fontSize: 14 }}>{b.imagerie ? `Oui · rendez-vous le ${b.imagerieDate || '(date à préciser)'}` : 'Non'}</Text>
            </View>
            <TouchableOpacity style={[styles.btnPrimary, { backgroundColor: '#F0654A', marginTop: 8 }]} onPress={() => { onDelete(b.id); onClose(); }}>
              <Text style={styles.btnPrimaryText}>Supprimer cette blessure</Text>
            </TouchableOpacity>
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
  const [newName, setNewName] = useState('');
  const [newPoste, setNewPoste] = useState('');
  const [soinInput, setSoinInput] = useState('');
  const [histInput, setHistInput] = useState('');
  const [clubInput, setClubInput] = useState('');
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [summaryFilter, setSummaryFilter] = useState(null);
  const [medicalSub, setMedicalSub] = useState('blessures');
  const [showBlessureForm, setShowBlessureForm] = useState(false);
  const [selectedBlessureId, setSelectedBlessureId] = useState(null);

  useEffect(() => {
    AsyncStorage.getItem('app_pin').then((stored) => {
      if (stored) { setPin(stored); load(stored); }
      setPinReady(true);
    });
    AsyncStorage.getItem('user_role').then((stored) => {
      if (stored) setRole(stored);
      setRoleReady(true);
    });
  }, []);

  const selectRole = async (key) => {
    await AsyncStorage.setItem('user_role', key);
    setRole(key);
  };

  const goHome = () => {
    setShowAdd(false);
    setShowBlessureForm(false);
    setSelectedBlessureId(null);
    setShowStatusPicker(false);
    setSummaryFilter(null);
    setSelectedId(null);
  };

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (showAdd) { setShowAdd(false); return true; }
      if (showBlessureForm) { setShowBlessureForm(false); return true; }
      if (selectedBlessureId) { setSelectedBlessureId(null); return true; }
      if (showStatusPicker) { setShowStatusPicker(false); return true; }
      if (summaryFilter) { setSummaryFilter(null); return true; }
      if (selectedId) { setSelectedId(null); return true; }
      return false; // à l'accueil : laisse le comportement par défaut (quitter l'appli)
    });
    return () => sub.remove();
  }, [showAdd, showBlessureForm, selectedBlessureId, showStatusPicker, summaryFilter, selectedId]);

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
            <Text style={styles.btnPrimaryText}>Continuer</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!role) {
    return (
      <SafeAreaView style={styles.shell}>
        <StatusBar barStyle="light-content" />
        <View style={[styles.center, { justifyContent: 'flex-start', paddingTop: 60 }]}>
          <Text style={styles.heading}>QUI ES-TU ?</Text>
          <Text style={{ color: COLORS.muted, fontSize: 13, marginTop: 6, marginBottom: 28, textAlign: 'center' }}>Choisis ton profil pour continuer</Text>
          <View style={{ width: '100%', gap: 10 }}>
            {ROLES.map((r) => (
              <TouchableOpacity key={r.key} style={styles.roleBtn} onPress={() => selectRole(r.key)}>
                <Text style={{ color: COLORS.text, fontWeight: '700', fontSize: 15 }}>{r.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const ALLOWED_ROLES = ['soigneur', 'administrateur'];

  if (role && !ALLOWED_ROLES.includes(role)) {
    return (
      <SafeAreaView style={styles.shell}>
        <StatusBar barStyle="light-content" />
        <View style={styles.center}>
          <Text style={styles.heading}>ACCÈS RÉSERVÉ</Text>
          <Text style={{ color: COLORS.muted, fontSize: 13, marginTop: 10, marginBottom: 28, textAlign: 'center' }}>
            Le suivi des joueurs est réservé aux profils Soigneur et Administrateur.
          </Text>
          <TouchableOpacity style={[styles.btnPrimary, { width: 220 }]} onPress={async () => { await AsyncStorage.removeItem('user_role'); setRole(''); }}>
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

  const player = players.find((p) => p.id === selectedId);

  // ---------- DETAIL ----------
  if (player) {
    const activeSoins = player.soins.filter((s) => s.actif);
    const oldSoins = player.soins.filter((s) => !s.actif);
    const age = calcAge(player.birthdate);

    return (
      <SafeAreaView style={styles.shell}>
        <StatusBar barStyle="light-content" />
        <View style={styles.detailTop}>
          <TouchableOpacity onPress={() => setSelectedId(null)} style={styles.iconBtn}><Text style={{ color: COLORS.text, fontSize: 22 }}>‹</Text></TouchableOpacity>
          <TouchableOpacity onPress={pickPhoto} style={{ marginRight: 4 }}>
            <Avatar player={player} size={44} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.heading}>{player.name.toUpperCase()}</Text>
            <Text style={{ color: COLORS.muted, fontSize: 12 }}>{[player.poste, age !== null ? `${age} ans` : null].filter(Boolean).join(' · ')}</Text>
          </View>
          <TouchableOpacity style={styles.iconBtn} onPress={() => wrap(async () => { await api.deletePlayer(pin, player.id); setSelectedId(null); })}>
            <Text style={{ color: COLORS.muted }}>Suppr.</Text>
          </TouchableOpacity>
        </View>
        {!!toast && <View style={[styles.toast, { position: 'relative', bottom: undefined, left: undefined, right: undefined, marginHorizontal: 18, marginTop: 10 }]}><Text style={{ color: '#fff', fontSize: 12, textAlign: 'center' }}>{toast}</Text></View>}

        <View style={{ paddingHorizontal: 18, paddingTop: 14 }}>
          <StatusBadge status={player.status} onPress={() => setShowStatusPicker(true)} />
        </View>
        <StatusPickerModal
          visible={showStatusPicker}
          current={player.status}
          onClose={() => setShowStatusPicker(false)}
          onSelect={(key) => { setShowStatusPicker(false); wrap(() => api.updatePlayer(pin, player.id, { status: key })); }}
        />
        <BlessureFormModal
          visible={showBlessureForm}
          onClose={() => setShowBlessureForm(false)}
          onSave={(data) => {
            setShowBlessureForm(false);
            wrap(async () => {
              await api.addBlessure(pin, player.id, data);
              await api.updatePlayer(pin, player.id, { status: 'indisponible' });
            });
          }}
        />
        <BlessureDetailModal
          blessure={(player.blessures || []).find((b) => b.id === selectedBlessureId)}
          onClose={() => setSelectedBlessureId(null)}
          onDelete={(id) => wrap(() => api.deleteBlessure(pin, id))}
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
              <InfoField label="Poste" value={player.poste} onSave={(v) => wrap(() => api.updatePlayer(pin, player.id, { poste: v }))} />
              <InfoField label="Date de naissance (JJ/MM/AAAA)" value={player.birthdate} onSave={(v) => wrap(() => api.updatePlayer(pin, player.id, { birthdate: v }))} keyboardType="numbers-and-punctuation" />
              {age !== null && <Text style={{ color: COLORS.muted, fontSize: 12, marginTop: -8, marginBottom: 12 }}>Âge calculé : {age} ans</Text>}
              <InfoField label="Taille (cm)" value={player.height} onSave={(v) => wrap(() => api.updatePlayer(pin, player.id, { height: v }))} keyboardType="numeric" />
              <InfoField label="Poids (kg)" value={player.weight} onSave={(v) => wrap(() => api.updatePlayer(pin, player.id, { weight: v }))} keyboardType="numeric" />
              <InfoField label="Téléphone" value={player.phone} onSave={(v) => wrap(() => api.updatePlayer(pin, player.id, { phone: v }))} keyboardType="phone-pad" />
              <InfoField label="Email" value={player.email} onSave={(v) => wrap(() => api.updatePlayer(pin, player.id, { email: v }))} keyboardType="email-address" />
              <InfoField label="Groupe sanguin" value={player.bloodType} onSave={(v) => wrap(() => api.updatePlayer(pin, player.id, { bloodType: v }))} />
              <InfoField label="Allergies" value={player.allergies} onSave={(v) => wrap(() => api.updatePlayer(pin, player.id, { allergies: v }))} multiline />
              <InfoField label="Numéro de licence" value={player.licenseNumber} onSave={(v) => wrap(() => api.updatePlayer(pin, player.id, { licenseNumber: v }))} />
              <Text style={[styles.fieldLabel, { marginTop: 4, marginBottom: 10, fontSize: 12 }]}>Contact d'urgence</Text>
              <InfoField label="Nom du contact" value={player.emergencyContactName} onSave={(v) => wrap(() => api.updatePlayer(pin, player.id, { emergencyContactName: v }))} />
              <InfoField label="Téléphone du contact" value={player.emergencyContactPhone} onSave={(v) => wrap(() => api.updatePlayer(pin, player.id, { emergencyContactPhone: v }))} keyboardType="phone-pad" />

              <Text style={[styles.fieldLabel, { marginTop: 4, marginBottom: 10, fontSize: 12 }]}>Clubs précédents</Text>
              <View style={styles.inlineAdd}>
                <TextInput style={styles.inlineInput} placeholder="Nom du club…" placeholderTextColor={COLORS.muted} value={clubInput} onChangeText={setClubInput} />
                <TouchableOpacity style={styles.inlineBtn} onPress={() => { if (clubInput.trim()) { wrap(() => api.addClub(pin, player.id, clubInput.trim())); setClubInput(''); } }}>
                  <Text style={styles.inlineBtnText}>+</Text>
                </TouchableOpacity>
              </View>
              {(!player.clubs || player.clubs.length === 0) && <Text style={styles.empty}>Aucun club précédent enregistré.</Text>}
              {(player.clubs || []).map((c) => (
                <View key={c.id} style={styles.entry}>
                  <View style={{ flex: 1 }}><Text style={styles.entryTxt}>{c.nom}</Text></View>
                  <TouchableOpacity onPress={() => wrap(() => api.deleteClub(pin, c.id))}><Text style={{ color: COLORS.muted }}>Suppr.</Text></TouchableOpacity>
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
                  <TouchableOpacity style={[styles.btnPrimary, { marginBottom: 14 }]} onPress={() => setShowBlessureForm(true)}>
                    <Text style={styles.btnPrimaryText}>+ Ajouter une nouvelle blessure</Text>
                  </TouchableOpacity>
                  {(!player.blessures || player.blessures.length === 0) && <Text style={styles.empty}>Aucune blessure enregistrée.</Text>}
                  {sortByDateDesc(player.blessures || [], (b) => b.date).map((b) => (
                    <TouchableOpacity key={b.id} onPress={() => setSelectedBlessureId(b.id)} style={[styles.entry, { borderLeftColor: '#F0654A', flexDirection: 'column', alignItems: 'stretch' }]}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={[styles.entryTxt, { fontWeight: '700' }]}>{blessureLabel(b)}</Text>
                        <TouchableOpacity onPress={() => wrap(() => api.deleteBlessure(pin, b.id))}><Text style={{ color: COLORS.muted }}>Suppr.</Text></TouchableOpacity>
                      </View>
                      {!!b.date && <Text style={styles.entryDate}>{b.date}</Text>}
                      {!!b.diagnostic && <Text style={[styles.entryTxt, { marginTop: 4 }]}>{b.diagnostic}</Text>}
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                        {!!b.mecanisme && <View style={styles.tag}><Text style={styles.tagText}>{b.mecanisme}</Text></View>}
                        <View style={styles.tag}><Text style={styles.tagText}>{b.imagerie ? `Imagerie · ${b.imagerieDate || 'date à préciser'}` : 'Pas d\'imagerie'}</Text></View>
                      </View>
                    </TouchableOpacity>
                  ))}
                </>
              )}

              {medicalSub === 'soins' && (
                <>
                  <View style={styles.inlineAdd}>
                    <TextInput style={styles.inlineInput} placeholder="Nouveau soin…" placeholderTextColor={COLORS.muted} value={soinInput} onChangeText={setSoinInput} />
                    <TouchableOpacity style={styles.inlineBtn} onPress={() => { if (soinInput.trim()) { wrap(() => api.addSoin(pin, player.id, soinInput.trim(), today())); setSoinInput(''); } }}>
                      <Text style={styles.inlineBtnText}>+</Text>
                    </TouchableOpacity>
                  </View>
                  {activeSoins.length === 0 && oldSoins.length === 0 && <Text style={styles.empty}>Aucun soin enregistré.</Text>}
                  {activeSoins.map((s) => (
                    <View key={s.id}>
                      <View style={[styles.entry, { borderLeftColor: '#F0654A' }]}>
                        <View style={{ flex: 1 }}><Text style={styles.entryTxt}>{s.texte}</Text><Text style={styles.entryDate}>{s.date}</Text></View>
                        <TouchableOpacity onPress={() => wrap(() => api.deleteSoin(pin, s.id))}><Text style={{ color: COLORS.muted }}>Suppr.</Text></TouchableOpacity>
                      </View>
                      <TouchableOpacity onPress={() => wrap(() => api.resolveSoin(pin, s.id))}>
                        <Text style={{ color: '#52D17C', fontSize: 11, fontWeight: '700', marginBottom: 8, marginTop: -4 }}>✓ Marquer comme soigné</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                  {oldSoins.length > 0 && <Text style={styles.subheading}>Résolus</Text>}
                  {oldSoins.map((s) => (
                    <View key={s.id} style={styles.entry}>
                      <View style={{ flex: 1 }}><Text style={styles.entryTxt}>{s.texte}</Text><Text style={styles.entryDate}>{s.date}</Text></View>
                      <TouchableOpacity onPress={() => wrap(() => api.deleteSoin(pin, s.id))}><Text style={{ color: COLORS.muted }}>Suppr.</Text></TouchableOpacity>
                    </View>
                  ))}
                </>
              )}
            </>
          )}

          {tab === 'historique' && (
            <>
              <View style={styles.inlineAdd}>
                <TextInput style={styles.inlineInput} placeholder="Antécédent médical…" placeholderTextColor={COLORS.muted} value={histInput} onChangeText={setHistInput} />
                <TouchableOpacity style={styles.inlineBtn} onPress={() => { if (histInput.trim()) { wrap(() => api.addHistorique(pin, player.id, histInput.trim(), today())); setHistInput(''); } }}>
                  <Text style={styles.inlineBtnText}>+</Text>
                </TouchableOpacity>
              </View>
              {(() => {
                const combined = [
                  ...player.historique.map((h) => ({ type: 'note', id: h.id, date: h.date, texte: h.texte })),
                  ...(player.blessures || []).map((b) => ({ type: 'blessure', id: b.id, date: b.date, texte: `Blessure : ${blessureLabel(b)}`, ref: b })),
                ];
                const sorted = sortByDateDesc(combined, (e) => e.date);
                if (sorted.length === 0) return <Text style={styles.empty}>Aucun antécédent enregistré.</Text>;
                return sorted.map((e) =>
                  e.type === 'blessure' ? (
                    <TouchableOpacity key={'b-' + e.id} onPress={() => setSelectedBlessureId(e.id)} style={[styles.entry, { borderLeftColor: '#F0654A' }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.entryTxt}>{e.texte}</Text>
                        <Text style={styles.entryDate}>{e.date || 'Date non précisée'}</Text>
                      </View>
                      <Text style={{ color: COLORS.muted, fontSize: 11 }}>Voir ›</Text>
                    </TouchableOpacity>
                  ) : (
                    <View key={'n-' + e.id} style={styles.entry}>
                      <View style={{ flex: 1 }}><Text style={styles.entryTxt}>{e.texte}</Text><Text style={styles.entryDate}>{e.date}</Text></View>
                      <TouchableOpacity onPress={() => wrap(() => api.deleteHistorique(pin, e.id))}><Text style={{ color: COLORS.muted }}>Suppr.</Text></TouchableOpacity>
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

  return (
    <SafeAreaView style={styles.shell}>
      <StatusBar barStyle="light-content" />
      <View style={styles.top}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Text style={styles.heading}>SUIVI JOUEURS</Text>
          <TouchableOpacity onPress={async () => { await AsyncStorage.removeItem('user_role'); setRole(''); }}>
            <Text style={{ color: COLORS.muted, fontSize: 11, textDecorationLine: 'underline' }}>Changer de profil</Text>
          </TouchableOpacity>
        </View>
        <Text style={{ fontSize: 12, color: COLORS.muted, marginBottom: 14 }}>{players.length} joueur{players.length !== 1 ? 's' : ''} suivi{players.length !== 1 ? 's' : ''}</Text>
        <View style={styles.searchBox}>
          <Text style={{ color: COLORS.muted }}>⌕</Text>
          <TextInput style={styles.searchInput} placeholder="Rechercher un joueur…" placeholderTextColor={COLORS.muted} value={search} onChangeText={setSearch} />
        </View>
        <View style={styles.summaryRow}>
          {STATUTS.map((s) => {
            const count = players.filter((p) => p.status === s.key).length;
            if (count === 0) return null;
            return (
              <TouchableOpacity key={s.key} style={[styles.summaryPill, { borderColor: s.color }]} onPress={() => setSummaryFilter(s)}>
                <View style={[styles.dot, { backgroundColor: s.color }]} />
                <Text style={{ color: s.color, fontSize: 11, fontWeight: '700' }}>{count} {count > 1 ? s.plur : s.sing}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <FlatList
        style={{ paddingHorizontal: 18 }}
        data={filtered}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ paddingBottom: 100 }}
        ListEmptyComponent={<Text style={[styles.empty, { textAlign: 'center', marginTop: 20 }]}>Aucun joueur. Ajoute ton premier joueur avec le bouton +.</Text>}
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

      <TouchableOpacity style={styles.fab} onPress={() => setShowAdd(true)}>
        <Text style={{ color: '#0F1F2E', fontSize: 26, fontWeight: '800' }}>+</Text>
      </TouchableOpacity>

      {!!toast && <View style={styles.toast}><Text style={{ color: '#fff', fontSize: 12, textAlign: 'center' }}>{toast}</Text></View>}

      <SummaryListModal
        visible={!!summaryFilter}
        statut={summaryFilter}
        players={players}
        onClose={() => setSummaryFilter(null)}
        onOpenPlayer={(id) => { setSummaryFilter(null); setSelectedId(id); setTab('infos'); }}
      />

      <Modal visible={showAdd} animationType="slide" transparent onRequestClose={() => setShowAdd(false)}>
        <View style={styles.sheetOverlay}>
          <KeyboardAvoidingView style={styles.sheet} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 }}>
              <Text style={styles.heading}>NOUVEAU JOUEUR</Text>
              <TouchableOpacity onPress={() => setShowAdd(false)}><Text style={{ color: COLORS.muted }}>✕</Text></TouchableOpacity>
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
  chipActive: { backgroundColor: '#3DA9FC', borderColor: '#3DA9FC' },
  tag: { backgroundColor: COLORS.surface3, borderRadius: 6, paddingVertical: 3, paddingHorizontal: 8 },
  tagText: { color: COLORS.muted, fontSize: 11, fontWeight: '600' },
});

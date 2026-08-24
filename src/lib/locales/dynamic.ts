import type { CatalogSection } from './types';

// Copy selected from runtime state, policy branches, and hardware capabilities.
// These keys are intentionally explicit so uncommon recovery/error paths cannot
// silently fall back to English in a non-English session.
export const dynamicCopy = {
  '203.0.113.10:38333 [2001:db8::10]:38333': {
    fr: '203.0.113.10:38333 [2001:db8::10]:38333',
    es: '203.0.113.10:38333 [2001:db8::10]:38333'
  },
  '2of3': { fr: '2 sur 3', es: '2 de 3' },
  bitcoin_core: { fr: 'Bitcoin Core', es: 'Bitcoin Core' },
  bsms: { fr: 'BSMS', es: 'BSMS' },
  BSMS: { fr: 'BSMS', es: 'BSMS' },
  btc: { fr: 'BTC', es: 'BTC' },
  BTC: { fr: 'BTC', es: 'BTC' },
  canFinalize: { fr: 'finalisable', es: 'se puede finalizar' },
  checking_matches: { fr: 'vérification des correspondances', es: 'comprobando coincidencias' },
  choose: { fr: 'choisir', es: 'elegir' },
  confirm_empty_passphrase: {
    fr: 'confirmer la phrase secrète vide',
    es: 'confirmar frase de contraseña vacía'
  },
  cpfp: { fr: 'CPFP', es: 'CPFP' },
  decaying: { fr: 'seuil décroissant', es: 'umbral decreciente' },
  file_once: { fr: 'fichier unique', es: 'archivo una vez' },
  'http://your-node.onion:8332': {
    fr: 'http://votre-nœud.onion:8332',
    es: 'http://tu-nodo.onion:8332'
  },
  'https://node.example.com:8332': {
    fr: 'https://nœud.exemple.com:8332',
    es: 'https://nodo.ejemplo.com:8332'
  },
  JSON: { fr: 'JSON', es: 'JSON' },
  ledger: { fr: 'Ledger', es: 'Ledger' },
  Ledger: { fr: 'Ledger', es: 'Ledger' },
  local_core: { fr: 'Bitcoin Core local', es: 'Bitcoin Core local' },
  lower_fee: { fr: 'frais inférieurs', es: 'comisión menor' },
  multisig: { fr: 'multisig', es: 'multifirma' },
  needs_pin: { fr: 'PIN requis', es: 'requiere PIN' },
  of: { fr: 'sur', es: 'de' },
  prompt_pin: { fr: 'saisir le PIN', es: 'introducir PIN' },
  rbf: { fr: 'RBF', es: 'RBF' },
  recovery_signer_reused: {
    fr: 'signataire de récupération réutilisé',
    es: 'firmante de recuperación reutilizado'
  },
  regtest: { fr: 'Regtest', es: 'Regtest' },
  remote_core: { fr: 'Bitcoin Core distant', es: 'Bitcoin Core remoto' },
  s: { fr: 's', es: 's' },
  sats: { fr: 'sats', es: 'sats' },
  sign: { fr: 'signer', es: 'firmar' },
  wallet_already_exists: { fr: 'le portefeuille existe déjà', es: 'la cartera ya existe' },
  watch_only: { fr: 'observation seule', es: 'solo lectura' },
  ', then scan again.': { fr: ', puis relancez l’analyse.', es: ' y vuelve a escanear.' },
  '; unknown or reused sources are called out.': {
    fr: ' ; les sources inconnues ou réutilisées sont signalées.',
    es: '; se señalan los orígenes desconocidos o reutilizados.'
  },
  '{name}': { fr: '{name}', es: '{name}' },
  '{name}, {kind}': { fr: '{name}, {kind}', es: '{name}, {kind}' },
  '{name}, {kind}, active wallet': {
    fr: '{name}, {kind}, portefeuille actif',
    es: '{name}, {kind}, cartera activa'
  },
  '{name}, active wallet': { fr: '{name}, portefeuille actif', es: '{name}, cartera activa' },
  '~1 MONTH': { fr: 'ENV. 1 MOIS', es: 'APROX. 1 MES' },
  '~1 YEAR': { fr: 'ENV. 1 AN', es: 'APROX. 1 AÑO' },
  '2 of 3 + delayed key': { fr: '2 sur 3 + clé différée', es: '2 de 3 + clave diferida' },
  '2 of 3 + recovery': { fr: '2 sur 3 + récupération', es: '2 de 3 + recuperación' },
  'A fourth independent heir key can spend after each coin has aged about 52,560 blocks.': {
    fr: 'Une quatrième clé indépendante d’héritier peut dépenser lorsque chaque pièce a vieilli d’environ 52 560 blocs.',
    es: 'Una cuarta clave de heredero independiente puede gastar cuando cada moneda tenga unos 52.560 bloques de antigüedad.'
  },
  'A fourth independent key can spend after each coin has aged about 4,320 blocks.': {
    fr: 'Une quatrième clé indépendante peut dépenser lorsque chaque pièce a vieilli d’environ 4 320 blocs.',
    es: 'Una cuarta clave independiente puede gastar cuando cada moneda tenga unos 4.320 bloques de antigüedad.'
  },
  'a standard wallet': { fr: 'un portefeuille standard', es: 'una cartera estándar' },
  addresses: { fr: 'adresses', es: 'direcciones' },
  After: { fr: 'Après', es: 'Después de' },
  applying: { fr: 'application', es: 'aplicando' },
  approve: { fr: 'approuver', es: 'aprobar' },
  attention: { fr: 'attention requise', es: 'requiere atención' },
  Attention: { fr: 'Attention', es: 'Atención' },
  awaiting: { fr: 'en attente', es: 'en espera' },
  awaitingConfirmation: { fr: 'confirmation en attente', es: 'esperando confirmación' },
  backup: { fr: 'sauvegarde', es: 'copia de seguridad' },
  cancelled: { fr: 'annulé', es: 'cancelado' },
  cancelling: { fr: 'annulation', es: 'cancelando' },
  Choose: { fr: 'Choisir', es: 'Elegir' },
  coin: { fr: 'pièce', es: 'moneda' },
  connecting: { fr: 'connexion', es: 'conectando' },
  cosigner: { fr: 'cosignataire', es: 'cofirmante' },
  cosigners: { fr: 'cosignataires', es: 'cofirmantes' },
  detected: { fr: 'détecté', es: 'detectado' },
  'displays the Regtest output with a testnet prefix. Compare the exact address below.': {
    fr: 'affiche la sortie Regtest avec un préfixe testnet. Comparez exactement l’adresse ci-dessous.',
    es: 'muestra la salida de Regtest con un prefijo de testnet. Compara exactamente la dirección inferior.'
  },
  emergency: { fr: 'urgence', es: 'emergencia' },
  failed: { fr: 'échec', es: 'falló' },
  Frame: { fr: 'Image', es: 'Fotograma' },
  'from this unfinished wallet?': {
    fr: 'de ce portefeuille inachevé ?',
    es: 'de esta cartera sin terminar?'
  },
  'Groot recovery metadata': {
    fr: 'Métadonnées de récupération Groot',
    es: 'Metadatos de recuperación de Groot'
  },
  healthy: { fr: 'sain', es: 'correcto' },
  heir: { fr: 'héritier', es: 'heredero' },
  Hide: { fr: 'Masquer', es: 'Ocultar' },
  higher: { fr: 'plus élevés', es: 'mayores' },
  inheritance: { fr: 'héritage', es: 'herencia' },
  interrupted: { fr: 'interrompu', es: 'interrumpido' },
  keys: { fr: 'clés', es: 'claves' },
  lower: { fr: 'plus faibles', es: 'menores' },
  mixed: { fr: 'mélangée', es: 'mezclada' },
  'new cluster link': { fr: 'nouveau lien de groupe', es: 'nuevo vínculo de grupo' },
  'new public link': { fr: 'nouveau lien public', es: 'nuevo vínculo público' },
  'only for recovery; it is excluded from the immediate branch.': {
    fr: 'uniquement pour la récupération ; il est exclu de la branche immédiate.',
    es: 'solo para recuperación; se excluye de la rama inmediata.'
  },
  'other coins.': { fr: 'autres pièces.', es: 'otras monedas.' },
  path: { fr: 'chemin', es: 'ruta' },
  paths: { fr: 'chemins', es: 'rutas' },
  pending: { fr: 'en attente', es: 'pendiente' },
  policy: { fr: 'politique', es: 'política' },
  private: { fr: 'privé', es: 'privado' },
  ready: { fr: 'prêt', es: 'listo' },
  Ready: { fr: 'Prêt', es: 'Listo' },
  received: { fr: 'reçu', es: 'recibido' },
  recovery: { fr: 'récupération', es: 'recuperación' },
  'recovery path': { fr: 'chemin de récupération', es: 'ruta de recuperación' },
  Remove: { fr: 'Retirer', es: 'Quitar' },
  replaced: { fr: 'remplacé', es: 'reemplazado' },
  retry: { fr: 'réessayer', es: 'reintentar' },
  review: { fr: 'vérification', es: 'revisión' },
  Review: { fr: 'Vérifier', es: 'Revisar' },
  'Review:': { fr: 'Vérification :', es: 'Revisión:' },
  Scanning: { fr: 'Analyse', es: 'Escaneando' },
  sent: { fr: 'envoyé', es: 'enviado' },
  'Sent to': { fr: 'Envoyé à', es: 'Enviado a' },
  Settings: { fr: 'Réglages', es: 'Ajustes' },
  Show: { fr: 'Afficher', es: 'Mostrar' },
  'shows this after policy approval.': {
    fr: 'affiche ceci après l’approbation de la politique.',
    es: 'muestra esto tras aprobar la política.'
  },
  signatures: { fr: 'signatures', es: 'firmas' },
  'signatures required': { fr: 'signatures requises', es: 'firmas requeridas' },
  'signatures.': { fr: 'signatures.', es: 'firmas.' },
  signer: { fr: 'signataire', es: 'firmante' },
  signers: { fr: 'signataires', es: 'firmantes' },
  'source clusters combined': {
    fr: 'groupes de sources combinés',
    es: 'grupos de origen combinados'
  },
  standard: { fr: 'standard', es: 'estándar' },
  Syncing: { fr: 'Synchronisation', es: 'Sincronizando' },
  'the recovery path': { fr: 'le chemin de récupération', es: 'la ruta de recuperación' },
  'the required': { fr: 'les', es: 'las' },
  'This coin shares its address with': {
    fr: 'Cette pièce partage son adresse avec',
    es: 'Esta moneda comparte su dirección con'
  },
  'This coin shares its address with 1 other coin.': {
    fr: 'Cette pièce partage son adresse avec 1 autre pièce.',
    es: 'Esta moneda comparte su dirección con otra moneda.'
  },
  'this wallet': { fr: 'ce portefeuille', es: 'esta cartera' },
  unconfirmed: { fr: 'non confirmé', es: 'sin confirmar' },
  'unique frames scanned': { fr: 'images uniques analysées', es: 'fotogramas únicos escaneados' },
  used: { fr: 'utilisée', es: 'usada' },
  Uses: { fr: 'Utilise', es: 'Usa' },
  Wallet: { fr: 'Portefeuille', es: 'Cartera' },
  wallets: { fr: 'portefeuilles', es: 'carteras' },
  '· Address reused': { fr: '· Adresse réutilisée', es: '· Dirección reutilizada' },
  '· Already added as': { fr: '· Déjà ajouté comme', es: '· Ya añadido como' },
  '· Frozen': { fr: '· Gelée', es: '· Congelada' },
  '· Mixed': { fr: '· Mélangée', es: '· Mezclada' },
  '· Source unknown': { fr: '· Source inconnue', es: '· Origen desconocido' },
  '•••••• · Provenance hidden': {
    fr: '•••••• · Provenance masquée',
    es: '•••••• · Procedencia oculta'
  },
  'Add a wallet': { fr: 'Ajouter un portefeuille', es: 'Añadir una cartera' },
  'Add independent signers, verify the policy, and back it up.': {
    fr: 'Ajoutez des signataires indépendants, vérifiez la politique et sauvegardez-la.',
    es: 'Añade firmantes independientes, verifica la política y crea una copia.'
  },
  'Address shown after registration': {
    fr: 'Adresse affichée après l’enregistrement',
    es: 'Dirección mostrada tras el registro'
  },
  'Address shown on': { fr: 'Adresse affichée sur', es: 'Dirección mostrada en' },
  'All added': { fr: 'Tous ajoutés', es: 'Todos añadidos' },
  'Already added': { fr: 'Déjà ajouté', es: 'Ya añadido' },
  'Approve only if the device shows this exact address.': {
    fr: 'Approuvez uniquement si l’appareil affiche exactement cette adresse.',
    es: 'Aprueba solo si el dispositivo muestra exactamente esta dirección.'
  },
  'Available immediately': { fr: 'Disponible immédiatement', es: 'Disponible inmediatamente' },
  'Backup ready': { fr: 'Sauvegarde prête', es: 'Copia lista' },
  'Backup verified': { fr: 'Sauvegarde vérifiée', es: 'Copia verificada' },
  Balanced: { fr: 'Équilibré', es: 'Equilibrado' },
  'Begin on BitBox': { fr: 'Commencer sur BitBox', es: 'Empezar en BitBox' },
  'Best for ordinary shared custody': {
    fr: 'Idéal pour une garde partagée classique',
    es: 'Ideal para custodia compartida habitual'
  },
  'BSMS 1.0 descriptor record': {
    fr: 'Enregistrement de descripteur BSMS 1.0',
    es: 'Registro de descriptor BSMS 1.0'
  },
  'BSMS, descriptor text, or Groot JSON · up to 256 KiB': {
    fr: 'BSMS, texte de descripteur ou JSON Groot · jusqu’à 256 Kio',
    es: 'BSMS, texto de descriptor o JSON de Groot · hasta 256 KiB'
  },
  'Cancelling safely…': { fr: 'Annulation sécurisée…', es: 'Cancelando de forma segura…' },
  'Check your hardware device': {
    fr: 'Vérifiez votre appareil matériel',
    es: 'Comprueba tu dispositivo físico'
  },
  'Checking matching blocks': {
    fr: 'Vérification des blocs correspondants',
    es: 'Comprobando bloques coincidentes'
  },
  'Choose backup file': { fr: 'Choisir le fichier de sauvegarde', es: 'Elegir archivo de copia' },
  'Choose how this wallet can be spent.': {
    fr: 'Choisissez comment ce portefeuille peut être dépensé.',
    es: 'Elige cómo se puede gastar esta cartera.'
  },
  'Choose the amount, coins, and network fee.': {
    fr: 'Choisissez le montant, les pièces et les frais réseau.',
    es: 'Elige el importe, las monedas y la comisión de red.'
  },
  'Compact-filter sync stopped': {
    fr: 'Synchronisation par filtres compacts arrêtée',
    es: 'Sincronización por filtros compactos detenida'
  },
  'Compare the complete address above, then approve it on the device.': {
    fr: 'Comparez l’adresse complète ci-dessus, puis approuvez-la sur l’appareil.',
    es: 'Compara la dirección completa de arriba y apruébala en el dispositivo.'
  },
  "Compare the exact address below with the complete address on the signer's trusted display.": {
    fr: 'Comparez exactement l’adresse ci-dessous avec l’adresse complète sur l’écran fiable du signataire.',
    es: 'Compara exactamente la dirección inferior con la dirección completa en la pantalla fiable del firmante.'
  },
  'Complete the one-time policy-file import before signing.': {
    fr: 'Terminez l’importation unique du fichier de politique avant de signer.',
    es: 'Completa la importación única del archivo de política antes de firmar.'
  },
  'Confirming the selected wallet before deriving an address.': {
    fr: 'Confirmation du portefeuille sélectionné avant de dériver une adresse.',
    es: 'Confirmando la cartera seleccionada antes de derivar una dirección.'
  },
  'Connect and unlock': { fr: 'Connecter et déverrouiller', es: 'Conectar y desbloquear' },
  'Connect and unlock a signer saved in this wallet policy, then scan again.': {
    fr: 'Connectez et déverrouillez un signataire enregistré dans cette politique, puis relancez l’analyse.',
    es: 'Conecta y desbloquea un firmante guardado en esta política y vuelve a escanear.'
  },
  'Connect and unlock the signer to check it.': {
    fr: 'Connectez et déverrouillez le signataire pour le vérifier.',
    es: 'Conecta y desbloquea el firmante para comprobarlo.'
  },
  'Connect and unlock this wallet’s hardware signer, then scan again.': {
    fr: 'Connectez et déverrouillez le signataire matériel de ce portefeuille, puis relancez l’analyse.',
    es: 'Conecta y desbloquea el firmante físico de esta cartera y vuelve a escanear.'
  },
  'Connect signer to check': {
    fr: 'Connecter le signataire pour vérifier',
    es: 'Conectar firmante para comprobar'
  },
  'Connecting to filter peers': {
    fr: 'Connexion aux pairs de filtrage',
    es: 'Conectando con pares de filtros'
  },
  'Could not create the wallet': {
    fr: 'Impossible de créer le portefeuille',
    es: 'No se pudo crear la cartera'
  },
  'Designed for a larger family or team.': {
    fr: 'Conçu pour une famille ou une équipe plus grande.',
    es: 'Diseñado para una familia o equipo más grande.'
  },
  'Device needs attention': {
    fr: 'L’appareil requiert votre attention',
    es: 'El dispositivo requiere atención'
  },
  Disabled: { fr: 'Désactivé', es: 'Desactivado' },
  'Downloading and checking compact filters': {
    fr: 'Téléchargement et vérification des filtres compacts',
    es: 'Descargando y comprobando filtros compactos'
  },
  Enabled: { fr: 'Activé', es: 'Activado' },
  'Enter app PIN': {
    fr: 'Saisir le PIN de l’application',
    es: 'Introduce el PIN de la aplicación'
  },
  'Every payment always needs the chosen number of signers.': {
    fr: 'Chaque paiement requiert toujours le nombre de signataires choisi.',
    es: 'Cada pago siempre requiere el número de firmantes elegido.'
  },
  'Every receive address needs a permanent label.': {
    fr: 'Chaque adresse de réception nécessite une étiquette permanente.',
    es: 'Cada dirección de recepción necesita una etiqueta permanente.'
  },
  'Fee acceleration broadcast': {
    fr: 'Accélération des frais diffusée',
    es: 'Aceleración de comisión difundida'
  },
  'Fee acceleration broadcast.': {
    fr: 'Accélération des frais diffusée.',
    es: 'Aceleración de comisión difundida.'
  },
  'Fewer signatures become sufficient': {
    fr: 'Moins de signatures deviennent suffisantes',
    es: 'Bastan menos firmas'
  },
  'Fingerprint matches': { fr: 'L’empreinte correspond', es: 'La huella coincide' },
  'First delay': { fr: 'Premier délai', es: 'Primer plazo' },
  'Flip a physical coin and record each result.': {
    fr: 'Lancez une pièce physique et notez chaque résultat.',
    es: 'Lanza una moneda física y anota cada resultado.'
  },
  'Freezing…': { fr: 'Gel…', es: 'Congelando…' },
  'Groot checks only signer types saved in this wallet policy and ignores other connected device families.':
    {
      fr: 'Groot vérifie uniquement les types de signataires enregistrés dans cette politique et ignore les autres familles d’appareils connectées.',
      es: 'Groot solo comprueba los tipos de firmante guardados en esta política e ignora otras familias de dispositivos conectadas.'
    },
  'Groot checks only this saved signer type and ignores other connected device families.': {
    fr: 'Groot vérifie uniquement ce type de signataire enregistré et ignore les autres familles d’appareils connectées.',
    es: 'Groot solo comprueba este tipo de firmante guardado e ignora otras familias de dispositivos conectadas.'
  },
  'Groot matched the same public descriptor. No duplicate was created and nothing was changed. Open the existing wallet instead.':
    {
      fr: 'Groot a reconnu le même descripteur public. Aucun doublon n’a été créé et rien n’a changé. Ouvrez plutôt le portefeuille existant.',
      es: 'Groot encontró el mismo descriptor público. No se creó ningún duplicado ni se cambió nada. Abre la cartera existente.'
    },
  'Hardware device scan in progress': {
    fr: 'Analyse des appareils matériels en cours',
    es: 'Escaneo de dispositivos físicos en curso'
  },
  'Hidden in discreet mode': { fr: 'Masqué en mode discret', es: 'Oculto en modo discreto' },
  'Hide wallet amounts': {
    fr: 'Masquer les montants du portefeuille',
    es: 'Ocultar importes de la cartera'
  },
  'Keep Bitcoin Test open for Regtest and confirm the export on the device screen.': {
    fr: 'Gardez Bitcoin Test ouvert pour Regtest et confirmez l’exportation sur l’écran de l’appareil.',
    es: 'Mantén Bitcoin Test abierto para Regtest y confirma la exportación en la pantalla del dispositivo.'
  },
  'Keep Bitcoin Test open for Regtest and follow any prompt on the Ledger screen.': {
    fr: 'Gardez Bitcoin Test ouvert pour Regtest et suivez les instructions sur l’écran Ledger.',
    es: 'Mantén Bitcoin Test abierto para Regtest y sigue las indicaciones de la pantalla del Ledger.'
  },
  'Keep each signer connected and unlocked. Follow any instructions shown on the device.': {
    fr: 'Gardez chaque signataire connecté et déverrouillé. Suivez les instructions affichées sur l’appareil.',
    es: 'Mantén cada firmante conectado y desbloqueado. Sigue las instrucciones del dispositivo.'
  },
  'Keep the signer connected and unlocked.': {
    fr: 'Gardez le signataire connecté et déverrouillé.',
    es: 'Mantén el firmante conectado y desbloqueado.'
  },
  'Keep the signer connected. Follow any unlock instructions shown by Groot or the device.': {
    fr: 'Gardez le signataire connecté. Suivez les instructions de déverrouillage affichées par Groot ou l’appareil.',
    es: 'Mantén el firmante conectado. Sigue las instrucciones de desbloqueo de Groot o del dispositivo.'
  },
  'Keep the signer connected. Quit other wallet apps.': {
    fr: 'Gardez le signataire connecté. Quittez les autres applications de portefeuille.',
    es: 'Mantén el firmante conectado. Cierra otras aplicaciones de cartera.'
  },
  'Load backup file': { fr: 'Charger le fichier de sauvegarde', es: 'Cargar archivo de copia' },
  'Load wallet backup': {
    fr: 'Charger la sauvegarde du portefeuille',
    es: 'Cargar copia de la cartera'
  },
  'Loading receive addresses…': {
    fr: 'Chargement des adresses de réception…',
    es: 'Cargando direcciones de recepción…'
  },
  'Longer planned handoff': {
    fr: 'Transmission planifiée plus longue',
    es: 'Transmisión planificada más larga'
  },
  'Looking for a wallet signer': {
    fr: 'Recherche d’un signataire du portefeuille',
    es: 'Buscando un firmante de la cartera'
  },
  'Looking for hardware devices': {
    fr: 'Recherche d’appareils matériels',
    es: 'Buscando dispositivos físicos'
  },
  'Looking for your saved signer': {
    fr: 'Recherche de votre signataire enregistré',
    es: 'Buscando tu firmante guardado'
  },
  'Lose one key without losing access.': {
    fr: 'Perdez une clé sans perdre l’accès.',
    es: 'Pierde una clave sin perder el acceso.'
  },
  'Lower fee': { fr: 'Frais inférieurs', es: 'Comisión menor' },
  'More private': { fr: 'Plus privé', es: 'Más privado' },
  'More recovery keys become eligible': {
    fr: 'Davantage de clés de récupération deviennent admissibles',
    es: 'Se habilitan más claves de recuperación'
  },
  'Multisig wallet setup': {
    fr: 'Configuration du portefeuille multisig',
    es: 'Configuración de cartera multifirma'
  },
  'Name and configure the policy before adding signers.': {
    fr: 'Nommez et configurez la politique avant d’ajouter des signataires.',
    es: 'Nombra y configura la política antes de añadir firmantes.'
  },
  'Name the payment and choose its recipient.': {
    fr: 'Nommez le paiement et choisissez son destinataire.',
    es: 'Pon nombre al pago y elige su destinatario.'
  },
  'No compatible signer found': {
    fr: 'Aucun signataire compatible trouvé',
    es: 'No se encontró un firmante compatible'
  },
  'No new cluster link, unknown provenance, or address-reuse warning.': {
    fr: 'Aucun nouveau lien de groupe, provenance inconnue ou avertissement de réutilisation d’adresse.',
    es: 'Sin nuevos vínculos de grupo, procedencia desconocida ni avisos de reutilización de dirección.'
  },
  'No new links between existing groups.': {
    fr: 'Aucun nouveau lien entre les groupes existants.',
    es: 'Sin nuevos vínculos entre grupos existentes.'
  },
  'No results recorded': { fr: 'Aucun résultat enregistré', es: 'No hay resultados registrados' },
  'No setup needed': { fr: 'Aucun réglage requis', es: 'Sin configuración necesaria' },
  'One signature required': { fr: 'Une signature requise', es: 'Se requiere una firma' },
  'Open “Signer keys to compare” first.': {
    fr: 'Ouvrez d’abord « Clés de signataires à comparer ».',
    es: 'Abre primero «Claves de firmantes que comparar».'
  },
  'Operational policy plus recovery key': {
    fr: 'Politique opérationnelle avec clé de récupération',
    es: 'Política operativa con clave de recuperación'
  },
  'Payment intent': { fr: 'Intention de paiement', es: 'Intención de pago' },
  'Payment ready to broadcast': { fr: 'Paiement prêt à diffuser', es: 'Pago listo para difundir' },
  'Payment ready to sign': { fr: 'Paiement prêt à signer', es: 'Pago listo para firmar' },
  'Payment received': { fr: 'Paiement reçu', es: 'Pago recibido' },
  'Payment sent': { fr: 'Paiement envoyé', es: 'Pago enviado' },
  'Payment sent.': { fr: 'Paiement envoyé.', es: 'Pago enviado.' },
  'Pending activity hidden': {
    fr: 'Activité en attente masquée',
    es: 'Actividad pendiente oculta'
  },
  'Point the camera at a crypto-psbt QR': {
    fr: 'Pointez la caméra vers un QR crypto-psbt',
    es: 'Apunta la cámara a un QR crypto-psbt'
  },
  'Policy and first address verified on': {
    fr: 'Politique et première adresse vérifiées sur',
    es: 'Política y primera dirección verificadas en'
  },
  'Policy reference saved in Groot': {
    fr: 'Référence de politique enregistrée dans Groot',
    es: 'Referencia de política guardada en Groot'
  },
  'Previously compared': { fr: 'Comparé précédemment', es: 'Comparado anteriormente' },
  'Primary signer': { fr: 'Signataire principal', es: 'Firmante principal' },
  'Ready to check': { fr: 'Prêt à vérifier', es: 'Listo para comprobar' },
  'Receive address': { fr: 'Adresse de réception', es: 'Dirección de recepción' },
  'Received at': { fr: 'Reçu le', es: 'Recibido el' },
  'Received provenance': { fr: 'Provenance reçue', es: 'Procedencia recibida' },
  'Recovery delay': { fr: 'Délai de récupération', es: 'Plazo de recuperación' },
  'Recovery-only signer': {
    fr: 'Signataire de récupération uniquement',
    es: 'Firmante solo de recuperación'
  },
  'Reject the operation if even one character differs.': {
    fr: 'Refusez l’opération si un seul caractère diffère.',
    es: 'Rechaza la operación si difiere un solo carácter.'
  },
  'Replacement broadcast': { fr: 'Remplacement diffusé', es: 'Reemplazo difundido' },
  'Replacement broadcast.': { fr: 'Remplacement diffusé.', es: 'Reemplazo difundido.' },
  'Retired from presentation': { fr: 'Retirée de l’affichage', es: 'Retirada de la presentación' },
  'Review again': { fr: 'Vérifier à nouveau', es: 'Revisar de nuevo' },
  'Review everything carefully.': {
    fr: 'Vérifiez tout attentivement.',
    es: 'Revísalo todo con atención.'
  },
  'Review once, then collect': {
    fr: 'Vérifier une fois, puis recueillir',
    es: 'Revisar una vez y recopilar'
  },
  'Review the recipient, amount, fee, and change, then approve the transaction on the device.': {
    fr: 'Vérifiez le destinataire, le montant, les frais et la monnaie, puis approuvez la transaction sur l’appareil.',
    es: 'Revisa el destinatario, el importe, la comisión y el cambio; luego aprueba la transacción en el dispositivo.'
  },
  'Review the recipient, amount, fee, change, and wallet policy, then approve on the device.': {
    fr: 'Vérifiez le destinataire, le montant, les frais, la monnaie et la politique du portefeuille, puis approuvez sur l’appareil.',
    es: 'Revisa el destinatario, el importe, la comisión, el cambio y la política; luego aprueba en el dispositivo.'
  },
  'Roll a physical six-sided die and record each result.': {
    fr: 'Lancez un dé physique à six faces et notez chaque résultat.',
    es: 'Lanza un dado físico de seis caras y anota cada resultado.'
  },
  'Save another copy': { fr: 'Enregistrer une autre copie', es: 'Guardar otra copia' },
  'Save public descriptor text': {
    fr: 'Enregistrer le texte du descripteur public',
    es: 'Guardar texto del descriptor público'
  },
  'Saving verified wallet state': {
    fr: 'Enregistrement de l’état vérifié du portefeuille',
    es: 'Guardando el estado verificado de la cartera'
  },
  'Self-spend · network fee': {
    fr: 'Auto-envoi · frais réseau',
    es: 'Autoenvío · comisión de red'
  },
  'Shorter emergency fallback': {
    fr: 'Solution d’urgence plus courte',
    es: 'Alternativa de emergencia más corta'
  },
  'Show balance in BTC': { fr: 'Afficher le solde en BTC', es: 'Mostrar saldo en BTC' },
  'Show balance in sats': { fr: 'Afficher le solde en sats', es: 'Mostrar saldo en sats' },
  'Show transaction amount in BTC': {
    fr: 'Afficher le montant de la transaction en BTC',
    es: 'Mostrar importe de la transacción en BTC'
  },
  'Show transaction amount in sats': {
    fr: 'Afficher le montant de la transaction en sats',
    es: 'Mostrar importe de la transacción en sats'
  },
  'Show wallet amounts': {
    fr: 'Afficher les montants du portefeuille',
    es: 'Mostrar importes de la cartera'
  },
  'Signed transaction review': {
    fr: 'Vérification de la transaction signée',
    es: 'Revisión de la transacción firmada'
  },
  'Signer details': { fr: 'Détails du signataire', es: 'Detalles del firmante' },
  'Signer matches this wallet.': {
    fr: 'Le signataire correspond à ce portefeuille.',
    es: 'El firmante coincide con esta cartera.'
  },
  'Signing in progress': { fr: 'Signature en cours', es: 'Firma en curso' },
  'Single frame': { fr: 'Image unique', es: 'Fotograma único' },
  'Source unknown': { fr: 'Source inconnue', es: 'Origen desconocido' },
  'Standard wallet': { fr: 'Portefeuille standard', es: 'Cartera estándar' },
  'The recovery signer must be independent from every immediate-path signer.': {
    fr: 'Le signataire de récupération doit être indépendant de chaque signataire du chemin immédiat.',
    es: 'El firmante de recuperación debe ser independiente de todos los firmantes de la ruta inmediata.'
  },
  'The same keys remain, while the threshold intentionally falls over time.': {
    fr: 'Les mêmes clés restent, tandis que le seuil diminue volontairement avec le temps.',
    es: 'Se mantienen las mismas claves mientras el umbral disminuye intencionadamente con el tiempo.'
  },
  'The threshold stays fixed while additional keys become eligible.': {
    fr: 'Le seuil reste fixe tandis que des clés supplémentaires deviennent admissibles.',
    es: 'El umbral permanece fijo mientras se habilitan claves adicionales.'
  },
  'This changes coin selection only. Your bitcoin stays in this wallet.': {
    fr: 'Cela modifie uniquement la sélection des pièces. Votre bitcoin reste dans ce portefeuille.',
    es: 'Esto solo cambia la selección de monedas. Tu bitcoin permanece en esta cartera.'
  },
  'This hardware wallet is already in Groot': {
    fr: 'Ce portefeuille matériel est déjà dans Groot',
    es: 'Esta cartera física ya está en Groot'
  },
  'This makes the coin available for payments again.': {
    fr: 'Cela rend la pièce à nouveau disponible pour les paiements.',
    es: 'Esto vuelve a dejar la moneda disponible para pagos.'
  },
  'This wallet has no signer outside its immediate multisig.': {
    fr: 'Ce portefeuille n’a aucun signataire hors de son multisig immédiat.',
    es: 'Esta cartera no tiene firmantes fuera de su multifirma inmediata.'
  },
  'Three primary keys spend now; an independent fourth key becomes recovery-only later.': {
    fr: 'Trois clés principales dépensent maintenant ; une quatrième clé indépendante devient plus tard réservée à la récupération.',
    es: 'Tres claves principales gastan ahora; una cuarta clave independiente queda después solo para recuperación.'
  },
  'Transaction review': { fr: 'Vérification de la transaction', es: 'Revisión de la transacción' },
  'Unfreezing…': { fr: 'Dégel…', es: 'Descongelando…' },
  'Unlock, sign, and broadcast.': {
    fr: 'Déverrouillez, signez et diffusez.',
    es: 'Desbloquea, firma y difunde.'
  },
  'Unlock, then scan again': {
    fr: 'Déverrouiller, puis relancer l’analyse',
    es: 'Desbloquea y vuelve a escanear'
  },
  'Updated now': { fr: 'Mis à jour maintenant', es: 'Actualizado ahora' },
  'USB connection needed': { fr: 'Connexion USB requise', es: 'Se necesita conexión USB' },
  'Use this Ledger wallet': {
    fr: 'Utiliser ce portefeuille Ledger',
    es: 'Usar esta cartera Ledger'
  },
  'Use this Nova wallet': { fr: 'Utiliser ce portefeuille Nova', es: 'Usar esta cartera Nova' },
  'Use this only for disposable local testing.': {
    fr: 'Utilisez ceci uniquement pour des tests locaux jetables.',
    es: 'Úsalo solo para pruebas locales desechables.'
  },
  'Use this public backup': {
    fr: 'Utiliser cette sauvegarde publique',
    es: 'Usar esta copia pública'
  },
  'Use this Trezor wallet': {
    fr: 'Utiliser ce portefeuille Trezor',
    es: 'Usar esta cartera Trezor'
  },
  'Verify again': { fr: 'Vérifier à nouveau', es: 'Verificar de nuevo' },
  'Verify on device': { fr: 'Vérifier sur l’appareil', es: 'Verificar en el dispositivo' },
  'Verify policy': { fr: 'Vérifier la politique', es: 'Verificar política' },
  'Verify policy & first address': {
    fr: 'Vérifier la politique et la première adresse',
    es: 'Verificar política y primera dirección'
  },
  'Waiting for hardware approval': {
    fr: 'En attente de l’approbation matérielle',
    es: 'Esperando aprobación del dispositivo'
  },
  'Waiting for hardware signature': {
    fr: 'En attente de la signature matérielle',
    es: 'Esperando firma del dispositivo'
  },
  'Wallet could not be created': {
    fr: 'Impossible de créer le portefeuille',
    es: 'No se pudo crear la cartera'
  },
  'Wallet creation in progress': {
    fr: 'Création du portefeuille en cours',
    es: 'Creación de cartera en curso'
  },
  'Wallet policy previously verified': {
    fr: 'Politique du portefeuille vérifiée précédemment',
    es: 'Política de la cartera verificada anteriormente'
  },
  'Your bitcoin. Simply held.': {
    fr: 'Votre bitcoin. Détenu simplement.',
    es: 'Tu bitcoin. Custodiado con sencillez.'
  }
} as const satisfies CatalogSection;

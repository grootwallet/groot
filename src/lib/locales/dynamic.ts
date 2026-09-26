import type { CatalogSection } from './types';

// Copy selected from runtime state, policy branches, and hardware capabilities.
// These keys are intentionally explicit so uncommon recovery/error paths cannot
// silently fall back to English in a non-English session.
export const dynamicCopy = {
  'Not part of this wallet': {
    fr: 'Ne fait pas partie de ce portefeuille',
    es: 'No forma parte de esta cartera'
  },
  'Wallet membership unknown · unlock to identify': {
    fr: 'Appartenance inconnue · déverrouillez pour identifier',
    es: 'Pertenencia desconocida · desbloquea para identificar'
  },
  'Wallet key candidate · account checked before use': {
    fr: 'Clé candidate du portefeuille · compte vérifié avant utilisation',
    es: 'Posible clave de la cartera · cuenta verificada antes de usar'
  },
  'Use a BSMS or JSON backup. PDF cannot be imported or tested.': {
    fr: 'Utilisez une sauvegarde BSMS ou JSON. Un PDF ne peut pas être importé ni testé.',
    es: 'Usa una copia BSMS o JSON. No se puede importar ni probar un PDF.'
  },
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
  'Step 1 of 2 · Wallet policy': {
    fr: 'Étape 1 sur 2 · Politique du portefeuille',
    es: 'Paso 1 de 2 · Política de la cartera'
  },
  'Step 2 of 2 · Transaction review': {
    fr: 'Étape 2 sur 2 · Vérification de la transaction',
    es: 'Paso 2 de 2 · Revisión de la transacción'
  },
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
  'Hide full address': { fr: 'Masquer l’adresse complète', es: 'Ocultar dirección completa' },
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
  'Show full address': { fr: 'Afficher l’adresse complète', es: 'Mostrar dirección completa' },
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
  'Wallet policy reviewed — show transaction': {
    fr: 'Politique vérifiée — afficher la transaction',
    es: 'Política revisada — mostrar transacción'
  },
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
  'Cancel on your hardware device': {
    fr: 'Annulez sur votre appareil matériel',
    es: 'Cancela en tu dispositivo físico'
  },
  'Compare on Coldcard': {
    fr: 'Comparez sur Coldcard',
    es: 'Compara en Coldcard'
  },
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
  'Scanning Bitcoin Core history': {
    fr: 'Analyse de l’historique Bitcoin Core',
    es: 'Analizando el historial de Bitcoin Core'
  },
  'Wallet sync stopped': {
    fr: 'Synchronisation du portefeuille arrêtée',
    es: 'Sincronización de la cartera detenida'
  },
  'No wallet history has been verified yet. Retry when your connection is available.': {
    fr: 'Aucun historique du portefeuille n’a encore été vérifié. Réessayez lorsque votre connexion est disponible.',
    es: 'Todavía no se ha verificado el historial de la cartera. Inténtalo de nuevo cuando la conexión esté disponible.'
  },
  'Bitcoin Core is still syncing and has not reached this wallet’s last verified block. Balance remains verified through block {height}.':
    {
      fr: 'Bitcoin Core est encore en cours de synchronisation et n’a pas atteint le dernier bloc vérifié de ce portefeuille. Le solde reste vérifié jusqu’au bloc {height}.',
      es: 'Bitcoin Core aún se está sincronizando y no ha alcanzado el último bloque verificado de esta cartera. El saldo sigue verificado hasta el bloque {height}.'
    },
  'Bitcoin Core no longer stores the blocks needed after this wallet’s checkpoint. Balance remains verified through block {height}.':
    {
      fr: 'Bitcoin Core ne conserve plus les blocs nécessaires après le point de contrôle de ce portefeuille. Le solde reste vérifié jusqu’au bloc {height}.',
      es: 'Bitcoin Core ya no conserva los bloques necesarios después del punto de control de esta cartera. El saldo sigue verificado hasta el bloque {height}.'
    },
  'Compare the complete address above, then approve it on the device.': {
    fr: 'Comparez l’adresse complète ci-dessus, puis approuvez-la sur l’appareil.',
    es: 'Compara la dirección completa de arriba y apruébala en el dispositivo.'
  },
  'Coldcard has no approval step. Compare the address while Groot verifies it automatically.': {
    fr: 'Coldcard n’a aucune étape d’approbation. Comparez l’adresse pendant que Groot la vérifie automatiquement.',
    es: 'Coldcard no tiene ningún paso de aprobación. Compara la dirección mientras Groot la verifica automáticamente.'
  },
  "Compare this exact address with the one on your signer's display.": {
    fr: 'Comparez exactement cette adresse avec celle affichée par votre signataire.',
    es: 'Compara exactamente esta dirección con la que muestra tu firmante.'
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
  'Every receive address needs a label.': {
    fr: 'Chaque adresse de réception nécessite un libellé.',
    es: 'Cada dirección de recepción necesita una etiqueta.'
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
  'Follow any unlock prompt on the signer. Keep other wallet apps closed.': {
    fr: 'Suivez toute demande de déverrouillage sur le signataire. Gardez les autres applications de portefeuille fermées.',
    es: 'Sigue cualquier solicitud de desbloqueo en el firmante. Mantén cerradas las demás aplicaciones de cartera.'
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
  'Payment draft in progress': {
    fr: 'Brouillon de paiement en cours',
    es: 'Borrador de pago en curso'
  },
  'Recipient and labels saved': {
    fr: 'Destinataire et libellés enregistrés',
    es: 'Destinatario y etiquetas guardados'
  },
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
  'This hardware signer is already in Groot': {
    fr: 'Ce signataire matériel est déjà dans Groot',
    es: 'Este firmante físico ya está en Groot'
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
  'Never synced': { fr: 'Jamais synchronisé', es: 'Nunca sincronizado' },
  'This wallet has not completed a sync yet.': {
    fr: 'Ce portefeuille n’a pas encore terminé de synchronisation.',
    es: 'Esta cartera aún no ha completado una sincronización.'
  },
  'Updated {count} min ago': {
    fr: 'Mis à jour il y a {count} min',
    es: 'Actualizado hace {count} min'
  },
  'Updated {count} h ago': {
    fr: 'Mis à jour il y a {count} h',
    es: 'Actualizado hace {count} h'
  },
  'Updated {count} d ago': {
    fr: 'Mis à jour il y a {count} j',
    es: 'Actualizado hace {count} d'
  },
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
  'Waiting for Coldcard address display': {
    fr: 'En attente de l’affichage de l’adresse sur Coldcard',
    es: 'Esperando que Coldcard muestre la dirección'
  },
  'Waiting for hardware cancellation': {
    fr: 'En attente de l’annulation sur l’appareil',
    es: 'Esperando la cancelación en el dispositivo'
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
  '· Backup key available': {
    fr: '· Clé de secours disponible',
    es: '· Clave de respaldo disponible'
  },
  '{count} available soon': {
    fr: '{count} bientôt disponible(s)',
    es: '{count} disponible(s) pronto'
  },
  '{count} recovery-ready coins are being spent': {
    fr: '{count} pièces prêtes pour la récupération sont dépensées',
    es: 'Se gastan {count} monedas listas para recuperación'
  },
  '{count} selected coins already have their backup keys available': {
    fr: '{count} pièces sélectionnées ont déjà leur clé de secours disponible',
    es: '{count} monedas seleccionadas ya tienen disponible su clave de respaldo'
  },
  '{key} available in {count} blocks': {
    fr: '{key} disponible dans {count} blocs',
    es: '{key} disponible en {count} bloques'
  },
  '{key} available soon': { fr: '{key} bientôt disponible', es: '{key} disponible pronto' },
  '{threshold} of {total} signatures': {
    fr: '{threshold} signatures sur {total}',
    es: '{threshold} de {total} firmas'
  },
  '2 of 3 + backup key': { fr: '2 sur 3 + clé de secours', es: '2 de 3 + clave de respaldo' },
  '2 of 3 primary keys + recovery key later': {
    fr: '2 clés principales sur 3 + clé de récupération plus tard',
    es: '2 de 3 claves principales + clave de recuperación después'
  },
  '2 of 3 primary keys work now. The recovery key becomes available after the chosen wait.': {
    fr: '2 clés principales sur 3 fonctionnent maintenant. La clé de récupération devient disponible après l’attente choisie.',
    es: '2 de 3 claves principales funcionan ahora. La clave de recuperación estará disponible tras la espera elegida.'
  },
  'A recovery partner helps you or your heirs regain access.': {
    fr: 'Un partenaire de récupération vous aide, vous ou vos héritiers, à retrouver l’accès.',
    es: 'Un colaborador de recuperación te ayuda a ti o a tus herederos a recuperar el acceso.'
  },
  'ABOUT 3 MONTHS': { fr: 'ENV. 3 MOIS', es: 'APROX. 3 MESES' },
  'ABOUT 6 MONTHS': { fr: 'ENV. 6 MOIS', es: 'APROX. 6 MESES' },
  'After the chosen wait, the recovery key can spend that coin by itself. The normal 2-of-3 keys remain available.':
    {
      fr: 'Après l’attente choisie, la clé de récupération peut dépenser seule cette pièce. Les clés normales 2 sur 3 restent disponibles.',
      es: 'Tras la espera elegida, la clave de recuperación puede gastar esa moneda por sí sola. Las claves normales 2 de 3 siguen disponibles.'
    },
  'Assisted recovery': { fr: 'Récupération assistée', es: 'Recuperación asistida' },
  'Assisted recovery will combine your keys with a dedicated recovery service and guided beneficiary support. It is not available yet.':
    {
      fr: 'La récupération assistée combinera vos clés avec un service dédié et un accompagnement des bénéficiaires. Elle n’est pas encore disponible.',
      es: 'La recuperación asistida combinará tus claves con un servicio dedicado y apoyo guiado para beneficiarios. Aún no está disponible.'
    },
  'Available soon': { fr: 'Bientôt disponible', es: 'Disponible pronto' },
  'Available in {count} blocks': {
    fr: 'Disponible dans {count} blocs',
    es: 'Disponible en {count} bloques'
  },
  'Available since block {height}': {
    fr: 'Disponible depuis le bloc {height}',
    es: 'Disponible desde el bloque {height}'
  },
  'Backup key is not available yet': {
    fr: 'La clé de secours n’est pas encore disponible',
    es: 'La clave de respaldo aún no está disponible'
  },
  'Backup key protected': { fr: 'Clé de secours protégée', es: 'Clave de respaldo protegida' },
  'Backup key available': {
    fr: 'Clé de secours disponible',
    es: 'Clave de respaldo disponible'
  },
  'Backup keys protected': { fr: 'Clés de secours protégées', es: 'Claves de respaldo protegidas' },
  'Choose one coin whose extra key is ready.': {
    fr: 'Choisissez une pièce dont la clé supplémentaire est prête.',
    es: 'Elige una moneda cuya clave adicional esté lista.'
  },
  'Coin available': { fr: 'Pièce disponible', es: 'Moneda disponible' },
  'Can spend this coin alone': {
    fr: 'Peut dépenser seule cette pièce',
    es: 'Puede gastar esta moneda por sí sola'
  },
  'Choose a coin': { fr: 'Choisir une pièce', es: 'Elegir una moneda' },
  'Coins are up to date': { fr: 'Les pièces sont à jour', es: 'Las monedas están actualizadas' },
  'Coin timelines': { fr: 'Calendriers des pièces', es: 'Cronogramas de las monedas' },
  Coin: { fr: 'Pièce', es: 'Moneda' },
  'Coming soon': { fr: 'Bientôt', es: 'Próximamente' },
  'Confirmations, address and outpoint': {
    fr: 'Confirmations, adresse et point de sortie',
    es: 'Confirmaciones, dirección y punto de salida'
  },
  'e.g. Emergency recovery': {
    fr: 'ex. Récupération d’urgence',
    es: 'p. ej. Recuperación de emergencia'
  },
  'Each confirmed coin has its own wait before the recovery or heir key becomes available.': {
    fr: 'Chaque pièce confirmée a sa propre attente avant que la clé de récupération ou d’héritier soit disponible.',
    es: 'Cada moneda confirmada tiene su propia espera antes de que la clave de recuperación o heredero esté disponible.'
  },
  'Each coin has its own protection timeline.': {
    fr: 'Chaque pièce a son propre calendrier de protection.',
    es: 'Cada moneda tiene su propio calendario de protección.'
  },
  'Each coin starts its own wait after confirmation, so backup-key access can become available at different times.':
    {
      fr: 'Chaque pièce commence sa propre attente après confirmation. L’accès par clé de secours peut donc devenir disponible à des moments différents.',
      es: 'Cada moneda inicia su propia espera tras la confirmación, por lo que el acceso con la clave de respaldo puede habilitarse en momentos distintos.'
    },
  'Each coin has its own wait before the backup key becomes available.': {
    fr: 'Chaque pièce a sa propre attente avant que la clé de secours soit disponible.',
    es: 'Cada moneda tiene su propia espera antes de que la clave de respaldo esté disponible.'
  },
  'Extra key became available at block {height}': {
    fr: 'La clé supplémentaire est devenue disponible au bloc {height}',
    es: 'La clave adicional estuvo disponible en el bloque {height}'
  },
  'How assisted recovery works': {
    fr: 'Fonctionnement de la récupération assistée',
    es: 'Cómo funciona la recuperación asistida'
  },
  'How backup-key access works': {
    fr: 'Fonctionnement de l’accès par clé de secours',
    es: 'Cómo funciona el acceso con la clave de respaldo'
  },
  'Heir access': { fr: 'Accès de l’héritier', es: 'Acceso del heredero' },
  'Heir key after wait': {
    fr: 'Clé d’héritier après l’attente',
    es: 'Clave del heredero tras la espera'
  },
  'It can now move this coin by itself. Your usual 2-of-3 keys still work too.': {
    fr: 'Elle peut maintenant déplacer seule cette pièce. Vos clés habituelles 2 sur 3 fonctionnent toujours.',
    es: 'Ahora puede mover esta moneda por sí sola. Tus claves habituales 2 de 3 también siguen funcionando.'
  },
  'Keep using your normal keys, use the backup key, or restart this coin’s wait.': {
    fr: 'Continuez avec vos clés normales, utilisez la clé de secours ou relancez l’attente de cette pièce.',
    es: 'Sigue usando tus claves normales, usa la clave de respaldo o reinicia la espera de esta moneda.'
  },
  'Key available': { fr: 'Clé disponible', es: 'Clave disponible' },
  'Open an available coin to use the backup key or restart its wait.': {
    fr: 'Ouvrez une pièce disponible pour utiliser la clé de secours ou relancer son attente.',
    es: 'Abre una moneda disponible para usar la clave de respaldo o reiniciar su espera.'
  },
  'Policy details unavailable': {
    fr: 'Détails de la politique indisponibles',
    es: 'Detalles de la política no disponibles'
  },
  'Recovery access': { fr: 'Accès de récupération', es: 'Acceso de recuperación' },
  'Recovery key after wait': {
    fr: 'Clé de récupération après l’attente',
    es: 'Clave de recuperación tras la espera'
  },
  'Recovery status is paused until the chain is current.': {
    fr: 'L’état de récupération est suspendu jusqu’à ce que la chaîne soit à jour.',
    es: 'El estado de recuperación está en pausa hasta que la cadena esté actualizada.'
  },
  'Backup-key access becomes available separately for each coin. Your normal keys keep working.': {
    fr: 'L’accès par clé de secours devient disponible séparément pour chaque pièce. Vos clés normales continuent de fonctionner.',
    es: 'El acceso con la clave de respaldo se habilita por separado para cada moneda. Tus claves normales siguen funcionando.'
  },
  'Labels and existing public links': {
    fr: 'Libellés et liens publics existants',
    es: 'Etiquetas y enlaces públicos existentes'
  },
  mature: { fr: 'disponible', es: 'disponible' },
  'Native SegWit · Miniscript': {
    fr: 'SegWit natif · Miniscript',
    es: 'SegWit nativo · Miniscript'
  },
  'Network fee · {rate} sat/vB': {
    fr: 'Frais réseau · {rate} sat/vB',
    es: 'Comisión de red · {rate} sat/vB'
  },
  'No action is required': { fr: 'Aucune action requise', es: 'No es necesario hacer nada' },
  'No action is required. {key} is available for 1 coin.': {
    fr: 'Aucune action n’est requise. {key} est disponible pour 1 pièce.',
    es: 'No es necesario hacer nada. {key} está disponible para 1 moneda.'
  },
  'No action is required. {key} is available for {count} coins.': {
    fr: 'Aucune action n’est requise. {key} est disponible pour {count} pièces.',
    es: 'No es necesario hacer nada. {key} está disponible para {count} monedas.'
  },
  'No action is required. {key} will be available for 1 coin soon.': {
    fr: 'Aucune action n’est requise. {key} sera bientôt disponible pour 1 pièce.',
    es: 'No es necesario hacer nada. {key} estará disponible pronto para 1 moneda.'
  },
  'No action is required. The backup key is still waiting for every coin.': {
    fr: 'Aucune action n’est requise. La clé de secours est encore en attente pour chaque pièce.',
    es: 'No es necesario hacer nada. La clave de respaldo sigue en espera para cada moneda.'
  },
  'No action is required. Review coins only if you want to use the backup key or restart a wait.': {
    fr: 'Aucune action n’est requise. Consultez les pièces uniquement pour utiliser la clé de secours ou relancer une attente.',
    es: 'No es necesario hacer nada. Revisa las monedas solo si quieres usar la clave de respaldo o reiniciar una espera.'
  },
  'Not available yet': { fr: 'Pas encore disponible', es: 'Aún no disponible' },
  'One coin goes to one address. The network fee is deducted from it.': {
    fr: 'Une pièce va vers une adresse. Les frais réseau en sont déduits.',
    es: 'Una moneda va a una dirección. La comisión de red se deduce de ella.'
  },
  'One recovery-ready coin is being spent': {
    fr: 'Une pièce prête pour la récupération est dépensée',
    es: 'Se gasta una moneda lista para recuperación'
  },
  'Only the extra key signs this payment.': {
    fr: 'Seule la clé supplémentaire signe ce paiement.',
    es: 'Solo la clave adicional firma este pago.'
  },
  'Payments normally use 2 of 3 primary keys. The separate backup key becomes available per coin after its wait.':
    {
      fr: 'Les paiements utilisent normalement 2 clés principales sur 3. La clé de secours séparée devient disponible pour chaque pièce après son attente.',
      es: 'Los pagos normalmente usan 2 de 3 claves principales. La clave de respaldo separada estará disponible para cada moneda tras su espera.'
    },
  'Postpone heir access': {
    fr: 'Reporter l’accès de l’héritier',
    es: 'Posponer acceso del heredero'
  },
  'Privacy & history': { fr: 'Confidentialité et historique', es: 'Privacidad e historial' },
  Protected: { fr: 'Protégée', es: 'Protegida' },
  'Protection timelines were refreshed.': {
    fr: 'Les calendriers de protection ont été actualisés.',
    es: 'Se actualizaron los plazos de protección.'
  },
  'Ready for the {key}': { fr: 'Prête pour la {key}', es: 'Lista para la {key}' },
  'Recipient receives': { fr: 'Le destinataire reçoit', es: 'El destinatario recibe' },
  'Recovery key unavailable': {
    fr: 'Clé de récupération indisponible',
    es: 'Clave de recuperación no disponible'
  },
  'Recovery key wait': {
    fr: 'Attente de la clé de récupération',
    es: 'Espera de la clave de recuperación'
  },
  'RECOVERY PAYMENT': { fr: 'PAIEMENT DE RÉCUPÉRATION', es: 'PAGO DE RECUPERACIÓN' },
  'Recovery-key payment broadcast': {
    fr: 'Paiement par clé de récupération diffusé',
    es: 'Pago con clave de recuperación transmitido'
  },
  'Restart recovery wait': {
    fr: 'Relancer l’attente de récupération',
    es: 'Reiniciar espera de recuperación'
  },
  'Review {key} payment': {
    fr: 'Vérifier le paiement avec la {key}',
    es: 'Revisar pago con la {key}'
  },
  'Review once, then approve with the {key}.': {
    fr: 'Vérifiez une fois, puis approuvez avec la {key}.',
    es: 'Revísalo una vez y aprueba con la {key}.'
  },
  'Send this coin with the {key}. The fee is deducted automatically.': {
    fr: 'Envoyez cette pièce avec la {key}. Les frais sont déduits automatiquement.',
    es: 'Envía esta moneda con la {key}. La comisión se deduce automáticamente.'
  },
  'Send to': { fr: 'Envoyer à', es: 'Enviar a' },
  'Spending access': { fr: 'Accès aux dépenses', es: 'Acceso para gastar' },
  'Signed by the {key}': { fr: 'Signé par la {key}', es: 'Firmado por la {key}' },
  'Spending them is safe with your normal keys. Any wallet change starts a fresh wait after confirmation.':
    {
      fr: 'Vous pouvez les dépenser avec vos clés normales. Toute monnaie rendue démarre une nouvelle attente après confirmation.',
      es: 'Puedes gastarlas con tus claves normales. Cualquier cambio inicia una nueva espera tras confirmarse.'
    },
  'Sync now': { fr: 'Synchroniser', es: 'Sincronizar ahora' },
  'Sync the wallet before using the extra key.': {
    fr: 'Synchronisez le portefeuille avant d’utiliser la clé supplémentaire.',
    es: 'Sincroniza la cartera antes de usar la clave adicional.'
  },
  'Syncing…': { fr: 'Synchronisation…', es: 'Sincronizando…' },
  'Technical details': { fr: 'Détails techniques', es: 'Detalles técnicos' },
  Timeline: { fr: 'Calendrier', es: 'Cronología' },
  'The {key} is ready': { fr: 'La {key} est prête', es: 'La {key} está lista' },
  'The {key} signs alone. The fee is deducted from this coin.': {
    fr: 'La {key} signe seule. Les frais sont déduits de cette pièce.',
    es: 'La {key} firma sola. La comisión se deduce de esta moneda.'
  },
  'The backup key stays separate from the primary 2-of-3.': {
    fr: 'La clé de secours reste séparée des 2 clés principales sur 3.',
    es: 'La clave de respaldo permanece separada de las 2 de 3 claves principales.'
  },
  'The network fee is deducted from that coin, so the recipient gets the remainder.': {
    fr: 'Les frais réseau sont déduits de cette pièce ; le destinataire reçoit le reste.',
    es: 'La comisión de red se deduce de esa moneda; el destinatario recibe el resto.'
  },
  'The recovery or heir key becomes available separately for each coin. Your normal 2-of-3 keys always remain available.':
    {
      fr: 'La clé de récupération ou d’héritier devient disponible séparément pour chaque pièce. Vos clés normales 2 sur 3 restent toujours disponibles.',
      es: 'La clave de recuperación o heredero estará disponible por separado para cada moneda. Tus claves normales 2 de 3 siempre siguen disponibles.'
    },
  'The wait starts separately for each received coin.': {
    fr: 'L’attente commence séparément pour chaque pièce reçue.',
    es: 'La espera comienza por separado para cada moneda recibida.'
  },
  'This coin already has its backup key available': {
    fr: 'La clé de secours de cette pièce est déjà disponible',
    es: 'Esta moneda ya tiene disponible su clave de respaldo'
  },
  'This sends one coin to the address you choose. No other wallet coins are combined.': {
    fr: 'Une seule pièce est envoyée à l’adresse choisie. Aucune autre pièce du portefeuille n’est combinée.',
    es: 'Esto envía una moneda a la dirección elegida. No se combina ninguna otra moneda de la cartera.'
  },
  'Three primary keys. One backup recovery key.': {
    fr: 'Trois clés principales. Une clé de récupération de secours.',
    es: 'Tres claves principales. Una clave de recuperación de respaldo.'
  },
  'Use {key}': { fr: 'Utiliser la {key}', es: 'Usar la {key}' },
  'Use heir key': { fr: 'Utiliser la clé d’héritier', es: 'Usar clave de heredero' },
  'Use recovery key': { fr: 'Utiliser la clé de récupération', es: 'Usar clave de recuperación' },
  'Use the one-key recovery flow, or continue here with your normal 2-of-3 keys.': {
    fr: 'Utilisez le parcours de récupération à une clé, ou continuez ici avec vos clés normales 2 sur 3.',
    es: 'Usa el flujo de recuperación con una clave o continúa aquí con tus claves normales 2 de 3.'
  },
  'View coin': { fr: 'Voir la pièce', es: 'Ver moneda' },
  'View options': { fr: 'Voir les options', es: 'Ver opciones' },
  'Wait starts after confirmation': {
    fr: 'L’attente commence après confirmation',
    es: 'La espera comienza tras la confirmación'
  },
  'Waiting · {count} blocks': {
    fr: 'En attente · {count} blocs',
    es: 'En espera · {count} bloques'
  },
  'What happens': { fr: 'Ce qui se passe', es: 'Qué sucede' },
  'What this means': { fr: 'Ce que cela signifie', es: 'Qué significa' },
  'When it is available, choose that coin to send with the recovery or heir key.': {
    fr: 'Lorsqu’elle est disponible, choisissez cette pièce pour l’envoyer avec la clé de récupération ou d’héritier.',
    es: 'Cuando esté disponible, elige esa moneda para enviarla con la clave de recuperación o heredero.'
  },
  'When your backup key becomes available': {
    fr: 'Quand votre clé de secours devient disponible',
    es: 'Cuándo estará disponible tu clave de respaldo'
  },
  'Normal keys still work for 1 coin.': {
    fr: 'Les clés normales fonctionnent toujours pour 1 pièce.',
    es: 'Las claves normales siguen funcionando para 1 moneda.'
  },
  'Normal keys still work for all {count} coins.': {
    fr: 'Les clés normales fonctionnent toujours pour les {count} pièces.',
    es: 'Las claves normales siguen funcionando para las {count} monedas.'
  },
  'Next change in {count} blocks.': {
    fr: 'Prochain changement dans {count} blocs.',
    es: 'Próximo cambio en {count} bloques.'
  },
  'After its wait, the backup key can spend that coin alone. The coin does not expire, and your normal keys still work.':
    {
      fr: 'Après son délai, la clé de secours peut dépenser seule cette pièce. La pièce n’expire pas et vos clés normales fonctionnent toujours.',
      es: 'Tras su espera, la clave de respaldo puede gastar esa moneda por sí sola. La moneda no caduca y tus claves normales siguen funcionando.'
    },
  'Where should this coin go?': {
    fr: 'Où envoyer cette pièce ?',
    es: '¿Adónde debe ir esta moneda?'
  },
  'Who can spend this coin now': {
    fr: 'Qui peut dépenser cette pièce maintenant',
    es: 'Quién puede gastar esta moneda ahora'
  },
  'Your {key} can spend 1 coin': {
    fr: 'Votre {key} peut dépenser 1 pièce',
    es: 'Tu {key} puede gastar 1 moneda'
  },
  'Your {key} can spend {count} coins': {
    fr: 'Votre {key} peut dépenser {count} pièces',
    es: 'Tu {key} puede gastar {count} monedas'
  },
  '{required} of {total} keys': {
    fr: '{required} clés sur {total}',
    es: '{required} de {total} claves'
  },
  '{required} of {total} primary keys': {
    fr: '{required} clés principales sur {total}',
    es: '{required} de {total} claves principales'
  },
  '1 coin can now be spent with the {key}': {
    fr: '1 pièce peut maintenant être dépensée avec la {key}',
    es: 'Ahora se puede gastar 1 moneda con la {key}'
  },
  'About backup-key access': {
    fr: 'À propos de l’accès par clé de secours',
    es: 'Acerca del acceso con la clave de respaldo'
  },
  'Address reused · review before spending': {
    fr: 'Adresse réutilisée · vérifier avant de dépenser',
    es: 'Dirección reutilizada · revisar antes de gastar'
  },
  'wsh · Miniscript · BIP48': { fr: 'wsh · Miniscript · BIP48', es: 'wsh · Miniscript · BIP48' },
  'wsh · sortedmulti · BIP48': { fr: 'wsh · sortedmulti · BIP48', es: 'wsh · sortedmulti · BIP48' },
  'Your normal 2-of-3 keys still work. No action is required.': {
    fr: 'Vos clés normales 2 sur 3 fonctionnent toujours. Aucune action requise.',
    es: 'Tus claves normales 2 de 3 siguen funcionando. No es necesario hacer nada.'
  },
  'Your normal keys keep working for every coin.': {
    fr: 'Vos clés normales continuent de fonctionner pour chaque pièce.',
    es: 'Tus claves normales siguen funcionando para cada moneda.'
  },
  'Your normal keys approve this payment. Any wallet change begins a fresh wait after confirmation.':
    {
      fr: 'Vos clés normales approuvent ce paiement. Toute monnaie rendue commence une nouvelle attente après confirmation.',
      es: 'Tus claves normales aprueban este pago. Cualquier cambio inicia una nueva espera tras confirmarse.'
    },
  'Your normal keys still work. You can spend with the extra key, or move this coin within the wallet to restart its wait.':
    {
      fr: 'Vos clés normales fonctionnent toujours. Vous pouvez dépenser avec la clé supplémentaire ou déplacer cette pièce dans le portefeuille pour relancer son attente.',
      es: 'Tus claves normales siguen funcionando. Puedes gastar con la clave adicional o mover esta moneda dentro de la cartera para reiniciar su espera.'
    },
  'To make the extra key wait again, open that coin and choose the policy-specific restart action.':
    {
      fr: 'Pour remettre la clé supplémentaire en attente, ouvrez cette pièce et choisissez l’action de relance adaptée à la politique.',
      es: 'Para que la clave adicional vuelva a esperar, abre esa moneda y elige la acción de reinicio específica de la política.'
    },
  'Your bitcoin. Simply held.': {
    fr: 'Votre bitcoin. Détenu simplement.',
    es: 'Tu bitcoin. Custodiado con sencillez.'
  }
} as const satisfies CatalogSection;

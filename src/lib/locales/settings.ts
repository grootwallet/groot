import type { CatalogSection } from './types';

export const settingsCopy = {
  '{walletName} · Local display name only': {
    fr: '{walletName} · Nom d’affichage local uniquement',
    es: '{walletName} · Solo nombre de visualización local'
  },
  '{signerName} · Used on signing and verification screens': {
    fr: '{signerName} · Utilisé sur les écrans de signature et de vérification',
    es: '{signerName} · Se usa en las pantallas de firma y verificación'
  },
  'Lock {walletName} now': {
    fr: 'Verrouiller {walletName} maintenant',
    es: 'Bloquear {walletName} ahora'
  },
  'Remove only {walletName} from this device.': {
    fr: 'Supprimer uniquement {walletName} de cet appareil.',
    es: 'Eliminar solo {walletName} de este dispositivo.'
  },
  Verified: { fr: 'Vérifiée', es: 'Verificada' },
  'Backup required': { fr: 'Sauvegarde requise', es: 'Copia requerida' },
  'Bitcoin Core RPC · confirmed and mempool activity': {
    fr: 'RPC Bitcoin Core · activité confirmée et mempool',
    es: 'RPC de Bitcoin Core · actividad confirmada y de mempool'
  },
  'P2P compact filters · confirmed activity only': {
    fr: 'Filtres compacts P2P · activité confirmée uniquement',
    es: 'Filtros compactos P2P · solo actividad confirmada'
  },
  Check: { fr: 'Tester', es: 'Comprobar' },
  Connected: { fr: 'Connecté', es: 'Conectado' },
  Offline: { fr: 'Hors ligne', es: 'Sin conexión' },
  'Trusted remote server': { fr: 'Serveur distant approuvé', es: 'Servidor remoto de confianza' },
  'Not checked': { fr: 'Non vérifié', es: 'Sin comprobar' },
  'Previous scan failed': { fr: 'Échec de l’analyse précédente', es: 'El escaneo anterior falló' },
  'Previous scan interrupted': {
    fr: 'Analyse précédente interrompue',
    es: 'Escaneo anterior interrumpido'
  },
  'Scan cancelled': { fr: 'Analyse annulée', es: 'Escaneo cancelado' },
  'Cancelling safely…': { fr: 'Annulation sécurisée…', es: 'Cancelando de forma segura…' },
  'Unnamed wallet': { fr: 'Portefeuille sans nom', es: 'Cartera sin nombre' },
  'Software wallet': { fr: 'Portefeuille logiciel', es: 'Cartera de software' },
  'Hardware signer': { fr: 'Signataire matériel', es: 'Firmante físico' },
  'Multisig wallet': { fr: 'Portefeuille multisig', es: 'Cartera multifirma' },
  '1 minute': { fr: '1 minute', es: '1 minuto' },
  '5 minutes': { fr: '5 minutes', es: '5 minutos' },
  '15 minutes': { fr: '15 minutes', es: '15 minutos' },
  '30 minutes': { fr: '30 minutes', es: '30 minutos' },
  '1 hour': { fr: '1 heure', es: '1 hora' },
  'Policy and signer backups': {
    fr: 'Sauvegardes de politique et de signataires',
    es: 'Copias de política y firmantes'
  },
  'Hardware signer backup': {
    fr: 'Sauvegarde du signataire matériel',
    es: 'Copia del firmante físico'
  },
  'Recovery words + wallet passphrase': {
    fr: 'Mots de récupération + phrase secrète du portefeuille',
    es: 'Palabras de recuperación + frase de contraseña de la cartera'
  },
  'Keep the public descriptor and enough signer backups to restore access.': {
    fr: 'Conservez le descripteur public et suffisamment de sauvegardes de signataires pour restaurer l’accès.',
    es: 'Guarda el descriptor público y suficientes copias de firmantes para restaurar el acceso.'
  },
  'Recovery words remain on the signer. The app PIN only protects local Groot data.': {
    fr: 'Les mots de récupération restent sur le signataire. Le code PIN de l’application protège uniquement les données locales de Groot.',
    es: 'Las palabras de recuperación permanecen en el firmante. El PIN de la aplicación solo protege los datos locales de Groot.'
  },
  'Keep both together. Recovery words can be re-presented only in the authenticated native backup flow; the wallet passphrase cannot be displayed or reset.':
    {
      fr: 'Conservez-les ensemble. Les mots de récupération ne peuvent être réaffichés que dans le flux de sauvegarde natif authentifié ; la phrase secrète du portefeuille ne peut être ni affichée ni réinitialisée.',
      es: 'Guárdalos juntos. Las palabras de recuperación solo pueden volver a mostrarse en el flujo nativo de copia autenticado; la frase de contraseña de la cartera no se puede mostrar ni restablecer.'
    },
  'Keyboard shortcuts': { fr: 'Raccourcis clavier', es: 'Atajos de teclado' },
  'Navigate without leaving the keyboard.': {
    fr: 'Naviguez sans quitter le clavier.',
    es: 'Navega sin dejar el teclado.'
  },
  compact_filters: { fr: 'filtres compacts', es: 'filtros compactos' },
  '· height {height}': { fr: '· hauteur {height}', es: '· altura {height}' },
  '· initial download active': {
    fr: '· téléchargement initial actif',
    es: '· descarga inicial activa'
  },
  '{history} · {size} chain data · filter index {filter}{ibd}': {
    fr: '{history} · {size} de données de chaîne · index de filtres {filter}{ibd}',
    es: '{history} · {size} de datos de cadena · índice de filtros {filter}{ibd}'
  },
  'Full block history': { fr: 'Historique complet des blocs', es: 'Historial completo de bloques' },
  'Pruned from block {height}': {
    fr: 'Élagué depuis le bloc {height}',
    es: 'Podado desde el bloque {height}'
  },
  'Scanning blocks · {percent}%': {
    fr: 'Analyse des blocs · {percent} %',
    es: 'Escaneando bloques · {percent} %'
  },
  unknown: { fr: 'inconnu', es: 'desconocido' },
  'Verify RPC authentication, retained block history, IBD, disk use, and filter-index status.': {
    fr: 'Vérifiez l’authentification RPC, l’historique de blocs conservé, l’IBD, l’utilisation du disque et l’état de l’index de filtres.',
    es: 'Comprueba la autenticación RPC, el historial de bloques conservado, la descarga inicial, el uso del disco y el estado del índice de filtros.'
  },
  '20 is standard. Increase only if the wallet revealed long unused runs.': {
    fr: '20 est la valeur standard. Augmentez-la uniquement si le portefeuille a révélé de longues séries inutilisées.',
    es: '20 es el valor estándar. Auméntalo solo si la cartera reveló largas series sin usar.'
  },
  'A birthday after the wallet’s first payment can miss funds. A larger gap increases work and memory use.':
    {
      fr: 'Un bloc de naissance postérieur au premier paiement du portefeuille peut manquer des fonds. Un écart plus grand augmente le travail et l’utilisation de la mémoire.',
      es: 'Un bloque de nacimiento posterior al primer pago de la cartera puede omitir fondos. Un intervalo mayor aumenta el trabajo y el uso de memoria.'
    },
  'BIP157/158 peers provide public filters and matching blocks. Groot validates them locally; pending incoming payments are not discoverable through this source. This build keeps the public chain index in memory, so filters are downloaded again after an app restart; wallet history and checkpoints remain durable.':
    {
      fr: 'Les pairs BIP157/158 fournissent des filtres publics et les blocs correspondants. Groot les valide localement ; les paiements entrants en attente ne sont pas détectables par cette source. Cette version conserve l’index public de la chaîne en mémoire, donc les filtres sont téléchargés à nouveau après un redémarrage ; l’historique et les points de contrôle du portefeuille restent persistants.',
      es: 'Los pares BIP157/158 proporcionan filtros públicos y bloques coincidentes. Groot los valida localmente; esta fuente no puede detectar pagos entrantes pendientes. Esta versión mantiene el índice público de la cadena en memoria, por lo que los filtros se descargan de nuevo tras reiniciar; el historial y los puntos de control de la cartera siguen siendo persistentes.'
    },
  'Copy the node and sync method from another unlocked wallet.': {
    fr: 'Copiez le nœud et la méthode de synchronisation depuis un autre portefeuille déverrouillé.',
    es: 'Copia el nodo y el método de sincronización desde otra cartera desbloqueada.'
  },
  'Credentials in URLs are rejected. TLS uses system trust roots; Tor accepts only .onion destinations.':
    {
      fr: 'Les identifiants dans les URL sont refusés. TLS utilise les autorités de confiance du système ; Tor accepte uniquement les destinations .onion.',
      es: 'Se rechazan credenciales en las URL. TLS usa las raíces de confianza del sistema; Tor solo acepta destinos .onion.'
    },
  'Groot uses the RPC node below for confirmed blocks and mempool changes. It does not require Core’s block-filter index. A pruned node can sync while it still retains every block newer than this wallet’s checkpoint; an older rescan needs an archival node or a reindex/re-download with enough history.':
    {
      fr: 'Groot utilise le nœud RPC ci-dessous pour les blocs confirmés et les changements de mempool. L’index des filtres de blocs de Core n’est pas requis. Un nœud élagué peut synchroniser tant qu’il conserve tous les blocs postérieurs au point de contrôle du portefeuille ; une analyse plus ancienne nécessite un nœud d’archive ou une réindexation/un nouveau téléchargement avec assez d’historique.',
      es: 'Groot usa el nodo RPC inferior para bloques confirmados y cambios de mempool. No requiere el índice de filtros de bloques de Core. Un nodo podado puede sincronizar mientras conserve todos los bloques posteriores al punto de control de la cartera; un escaneo más antiguo necesita un nodo de archivo o una reindexación/nueva descarga con suficiente historial.'
    },
  'Import this file in a clean disposable Groot profile and confirm the first receive address matches.':
    {
      fr: 'Importez ce fichier dans un profil Groot vierge et jetable, puis confirmez que la première adresse de réception correspond.',
      es: 'Importa este archivo en un perfil limpio y desechable de Groot y confirma que la primera dirección de recepción coincide.'
    },
  'Inspect identity or run a health check': {
    fr: 'Inspecter l’identité ou lancer un contrôle d’état',
    es: 'Inspeccionar identidad o ejecutar comprobación de estado'
  },
  'One global setting; each unlocked wallet tracks its own inactivity.': {
    fr: 'Un réglage global ; chaque portefeuille déverrouillé suit sa propre inactivité.',
    es: 'Un ajuste global; cada cartera desbloqueada controla su propia inactividad.'
  },
  'Public test networks require at least two independent peers. Regtest permits one local peer.': {
    fr: 'Les réseaux de test publics exigent au moins deux pairs indépendants. Regtest autorise un seul pair local.',
    es: 'Las redes públicas de prueba requieren al menos dos pares independientes. Regtest permite un par local.'
  },
  'Save the descriptors, then confirm the backup restores this wallet.': {
    fr: 'Enregistrez les descripteurs, puis confirmez que la sauvegarde restaure ce portefeuille.',
    es: 'Guarda los descriptores y confirma que la copia restaura esta cartera.'
  },
  'Test its backup, then remove this watch-only wallet from this device.': {
    fr: 'Testez sa sauvegarde, puis supprimez ce portefeuille d’observation de cet appareil.',
    es: 'Prueba su copia de seguridad y elimina esta cartera de solo lectura del dispositivo.'
  },
  'The proxy must listen on loopback. Remote proxies are rejected.': {
    fr: 'Le proxy doit écouter sur l’interface de bouclage. Les proxys distants sont refusés.',
    es: 'El proxy debe escuchar en la interfaz local. Los proxies remotos se rechazan.'
  },
  'This descriptor cannot spend bitcoin, but it reveals every wallet address and transaction. Store it privately.':
    {
      fr: 'Ce descripteur ne peut pas dépenser de bitcoin, mais il révèle toutes les adresses et transactions du portefeuille. Conservez-le en privé.',
      es: 'Este descriptor no puede gastar bitcoin, pero revela todas las direcciones y transacciones de la cartera. Guárdalo en privado.'
    },
  'Use your written backup to confirm all 24 words in exact order.': {
    fr: 'Utilisez votre sauvegarde écrite pour confirmer les 24 mots dans l’ordre exact.',
    es: 'Usa tu copia escrita para confirmar las 24 palabras en el orden exacto.'
  },
  'Uses Groot’s isolated local Regtest cookie. Switch to username/password only for a custom local node.':
    {
      fr: 'Utilise le cookie Regtest local isolé de Groot. Passez au nom d’utilisateur/mot de passe uniquement pour un nœud local personnalisé.',
      es: 'Usa la cookie local aislada de Regtest de Groot. Cambia a usuario/contraseña solo para un nodo local personalizado.'
    },
  'When set, every P2P connection uses this loopback proxy. There is no direct fallback.': {
    fr: 'Lorsqu’il est défini, chaque connexion P2P utilise ce proxy de bouclage. Aucun repli direct n’est possible.',
    es: 'Cuando se configura, todas las conexiones P2P usan este proxy local. No existe conexión directa alternativa.'
  },
  '{blocks} blocks · full block history': {
    fr: '{blocks} blocs · historique complet des blocs',
    es: '{blocks} bloques · historial completo de bloques'
  },
  '{blocks} blocks · pruned from {height}': {
    fr: '{blocks} blocs · élagué à partir de {height}',
    es: '{blocks} bloques · podado desde {height}'
  },
  '{blocks} blocks · pruned from an unknown height': {
    fr: '{blocks} blocs · élagué à partir d’une hauteur inconnue',
    es: '{blocks} bloques · podado desde una altura desconocida'
  },
  'Connected at block {block} · full history.': {
    fr: 'Connecté au bloc {block} · historique complet.',
    es: 'Conectado en el bloque {block} · historial completo.'
  },
  'Connected at block {block} · pruned.': {
    fr: 'Connecté au bloc {block} · élagué.',
    es: 'Conectado en el bloque {block} · podado.'
  },
  'Copied from {walletName}.': {
    fr: 'Copié depuis {walletName}.',
    es: 'Copiado desde {walletName}.'
  },
  'The next refresh will discover confirmed activity through verified compact block filters.': {
    fr: 'La prochaine actualisation découvrira l’activité confirmée grâce à des filtres de blocs compacts vérifiés.',
    es: 'La próxima actualización descubrirá la actividad confirmada mediante filtros compactos de bloques verificados.'
  },
  'The next refresh will use the configured Bitcoin Core node.': {
    fr: 'La prochaine actualisation utilisera le nœud Bitcoin Core configuré.',
    es: 'La próxima actualización usará el nodo Bitcoin Core configurado.'
  },
  'Every wallet will lock after {minutes} minute of inactivity.': {
    fr: 'Chaque portefeuille se verrouillera après {minutes} minute d’inactivité.',
    es: 'Cada cartera se bloqueará tras {minutes} minuto de inactividad.'
  },
  'Every wallet will lock after {minutes} minutes of inactivity.': {
    fr: 'Chaque portefeuille se verrouillera après {minutes} minutes d’inactivité.',
    es: 'Cada cartera se bloqueará tras {minutes} minutos de inactividad.'
  },
  'This wallet is now shown as {walletName}.': {
    fr: 'Ce portefeuille apparaît maintenant sous le nom {walletName}.',
    es: 'Esta cartera aparece ahora como {walletName}.'
  },
  '{signerName} matches this wallet.': {
    fr: '{signerName} correspond à ce portefeuille.',
    es: '{signerName} coincide con esta cartera.'
  },
  'Recovered balance: {balance} {unit}': {
    fr: 'Solde récupéré : {balance} {unit}',
    es: 'Saldo recuperado: {balance} {unit}'
  },
  '· gap limit': { fr: '· limite d’écart', es: '· límite de intervalo' },
  '· Local display name only': {
    fr: '· Nom d’affichage local uniquement',
    es: '· Solo nombre de visualización local'
  },
  '· Used on signing and verification screens': {
    fr: '· Utilisé sur les écrans de signature et de vérification',
    es: '· Se usa en las pantallas de firma y verificación'
  },
  'Add wallet': { fr: 'Ajouter un portefeuille', es: 'Añadir cartera' },
  'Address gap limit': {
    fr: 'Limite d’écart des adresses',
    es: 'Límite de intervalo de direcciones'
  },
  'Amount display': { fr: 'Affichage des montants', es: 'Visualización de importes' },
  Authentication: { fr: 'Authentification', es: 'Autenticación' },
  'Automatic cookie authentication': {
    fr: 'Authentification automatique par cookie',
    es: 'Autenticación automática mediante cookie'
  },
  'Automatic lock': { fr: 'Verrouillage automatique', es: 'Bloqueo automático' },
  'Backup and recovery': {
    fr: 'Sauvegarde et récupération',
    es: 'Copia de seguridad y recuperación'
  },
  'Birthday block': { fr: 'Bloc de naissance', es: 'Bloque de nacimiento' },
  'Bitcoin Core activity sync.': {
    fr: 'Synchronisation de l’activité avec Bitcoin Core.',
    es: 'Sincronización de actividad con Bitcoin Core.'
  },
  'blocks processed': { fr: 'blocs traités', es: 'bloques procesados' },
  'Cancel scan': { fr: 'Annuler l’analyse', es: 'Cancelar escaneo' },
  'Compact filters': { fr: 'Filtres compacts', es: 'Filtros compactos' },
  'Confirmed activity only.': {
    fr: 'Activité confirmée uniquement.',
    es: 'Solo actividad confirmada.'
  },
  'Copy from': { fr: 'Copier depuis', es: 'Copiar desde' },
  'Create or recover another isolated wallet.': {
    fr: 'Créez ou récupérez un autre portefeuille isolé.',
    es: 'Crea o recupera otra cartera aislada.'
  },
  'Delete multisig wallet': {
    fr: 'Supprimer le portefeuille multisignature',
    es: 'Eliminar cartera multifirma'
  },
  'Delete wallet': { fr: 'Supprimer le portefeuille', es: 'Eliminar cartera' },
  'Earlier is safer; later is faster.': {
    fr: 'Plus tôt est plus sûr ; plus tard est plus rapide.',
    es: 'Antes es más seguro; después es más rápido.'
  },
  'Export & test wallet backup': {
    fr: 'Exporter et tester la sauvegarde',
    es: 'Exportar y probar la copia de seguridad'
  },
  'Export public descriptor': {
    fr: 'Exporter le descripteur public',
    es: 'Exportar descriptor público'
  },
  'Fee and broadcast node': {
    fr: 'Nœud de frais et de diffusion',
    es: 'Nodo de comisiones y difusión'
  },
  'from this device.': { fr: 'de cet appareil.', es: 'de este dispositivo.' },
  'Hardware signer identity & health': {
    fr: 'Identité et état du signataire matériel',
    es: 'Identidad y estado del firmante físico'
  },
  'Hardware signer name': { fr: 'Nom du signataire matériel', es: 'Nombre del firmante físico' },
  'Hostnames are rejected so proxy mode cannot leak DNS.': {
    fr: 'Les noms d’hôte sont refusés afin que le mode proxy ne puisse pas divulguer de requêtes DNS.',
    es: 'Los nombres de host se rechazan para que el modo proxy no pueda filtrar consultas DNS.'
  },
  'Last checked': { fr: 'Dernière vérification', es: 'Última comprobación' },
  'Local cookie': { fr: 'Cookie local', es: 'Cookie local' },
  'Local SOCKS5 proxy': { fr: 'Proxy SOCKS5 local', es: 'Proxy SOCKS5 local' },
  Lock: { fr: 'Verrouiller', es: 'Bloquear' },
  'Lock only this wallet immediately.': {
    fr: 'Verrouiller immédiatement ce portefeuille uniquement.',
    es: 'Bloquear inmediatamente solo esta cartera.'
  },
  'Make sure your recovery phrase is backed up.': {
    fr: 'Assurez-vous d’avoir sauvegardé votre phrase de récupération.',
    es: 'Asegúrate de tener una copia de tu frase de recuperación.'
  },
  'Manual mode never falls back to DNS seeds or public peers.': {
    fr: 'Le mode manuel ne se rabat jamais sur les graines DNS ni sur des pairs publics.',
    es: 'El modo manual nunca recurre a semillas DNS ni a pares públicos.'
  },
  'Manual peers · one numeric IP:port per line': {
    fr: 'Pairs manuels · une adresse IP numérique:port par ligne',
    es: 'Pares manuales · una IP numérica:puerto por línea'
  },
  'Manual peers only': { fr: 'Pairs manuels uniquement', es: 'Solo pares manuales' },
  'Network services': { fr: 'Services réseau', es: 'Servicios de red' },
  'Optional local Tor SOCKS5 proxy': {
    fr: 'Proxy SOCKS5 Tor local facultatif',
    es: 'Proxy SOCKS5 local de Tor opcional'
  },
  'Peer selection': { fr: 'Sélection des pairs', es: 'Selección de pares' },
  'Prepare backup': { fr: 'Préparer la sauvegarde', es: 'Preparar copia de seguridad' },
  'Public peer discovery': {
    fr: 'Découverte de pairs publics',
    es: 'Descubrimiento de pares públicos'
  },
  'Public, not harmless.': { fr: 'Public, mais pas anodin.', es: 'Público, pero no inofensivo.' },
  'Recovery scan': { fr: 'Analyse de récupération', es: 'Escaneo de recuperación' },
  'Recovery words not verified': {
    fr: 'Mots de récupération non vérifiés',
    es: 'Palabras de recuperación sin verificar'
  },
  'Recovery words stay inside the trusted native window.': {
    fr: 'Les mots de récupération restent dans la fenêtre native de confiance.',
    es: 'Las palabras de recuperación permanecen en la ventana nativa de confianza.'
  },
  'Remote TLS': { fr: 'TLS distant', es: 'TLS remoto' },
  'Remove only': { fr: 'Supprimer uniquement', es: 'Solo eliminar' },
  'Required peers': { fr: 'Pairs requis', es: 'Pares requeridos' },
  'Revealing or verifying them never sends the words into the webview.': {
    fr: 'Les afficher ou les vérifier n’envoie jamais les mots dans la vue web.',
    es: 'Mostrarlas o verificarlas nunca envía las palabras a la vista web.'
  },
  'RPC URL': { fr: 'URL RPC', es: 'URL RPC' },
  'RPC username': { fr: 'Nom d’utilisateur RPC', es: 'Usuario RPC' },
  'Save & rescan': { fr: 'Enregistrer et analyser', es: 'Guardar y volver a escanear' },
  'Save & test': { fr: 'Enregistrer et tester', es: 'Guardar y probar' },
  'Save a watch-only backup for independent recovery.': {
    fr: 'Enregistrez une sauvegarde d’observation pour une récupération indépendante.',
    es: 'Guarda una copia de solo lectura para una recuperación independiente.'
  },
  'Save descriptor': { fr: 'Enregistrer le descripteur', es: 'Guardar descriptor' },
  'Save name': { fr: 'Enregistrer le nom', es: 'Guardar nombre' },
  'Save signer name': { fr: 'Enregistrer le nom du signataire', es: 'Guardar nombre del firmante' },
  'Save source': { fr: 'Enregistrer la source', es: 'Guardar fuente' },
  Security: { fr: 'Sécurité', es: 'Seguridad' },
  'Test connection': { fr: 'Tester la connexion', es: 'Probar conexión' },
  'The RPC password stays inside trusted native code.': {
    fr: 'Le mot de passe RPC reste dans le code natif de confiance.',
    es: 'La contraseña RPC permanece en el código nativo de confianza.'
  },
  'This Mac': { fr: 'Ce Mac', es: 'Este Mac' },
  'Tor onion': { fr: 'Service onion Tor', es: 'Servicio onion de Tor' },
  'Type DELETE to confirm': {
    fr: 'Saisissez DELETE pour confirmer',
    es: 'Escribe DELETE para confirmar'
  },
  'Use 0 when uncertain. Regtest scans are intentionally cheap.': {
    fr: 'Utilisez 0 en cas de doute. Les analyses Regtest sont volontairement peu coûteuses.',
    es: 'Usa 0 si no estás seguro. Los escaneos de Regtest son intencionadamente ligeros.'
  },
  'Use an existing network setup': {
    fr: 'Utiliser une configuration réseau existante',
    es: 'Usar una configuración de red existente'
  },
  'Use one denomination throughout Groot.': {
    fr: 'Utilisez une seule unité dans tout Groot.',
    es: 'Usa una sola unidad en todo Groot.'
  },
  'Use setup': { fr: 'Utiliser la configuration', es: 'Usar configuración' },
  'Username and password': { fr: 'Nom d’utilisateur et mot de passe', es: 'Usuario y contraseña' },
  'Verify now': { fr: 'Vérifier maintenant', es: 'Verificar ahora' },
  'View descriptor': { fr: 'Afficher le descripteur', es: 'Ver descriptor' },
  'View recovery words first': {
    fr: 'Afficher d’abord les mots de récupération',
    es: 'Ver primero las palabras de recuperación'
  },
  'Wallet activity sync': {
    fr: 'Synchronisation de l’activité du portefeuille',
    es: 'Sincronización de actividad de la cartera'
  },
  'Wallet birthday block': {
    fr: 'Bloc de naissance du portefeuille',
    es: 'Bloque de nacimiento de la cartera'
  },
  'Wallet deletion': { fr: 'Suppression du portefeuille', es: 'Eliminación de la cartera' },
  'Wallet details': { fr: 'Détails du portefeuille', es: 'Detalles de la cartera' },
  'Wallet name': { fr: 'Nom du portefeuille', es: 'Nombre de la cartera' },
  'Wallet security and connection. Appearance is global.': {
    fr: 'Sécurité et connexion du portefeuille. L’apparence est globale.',
    es: 'Seguridad y conexión de la cartera. La apariencia es global.'
  },
  'WALLET SETTINGS': { fr: 'RÉGLAGES DU PORTEFEUILLE', es: 'AJUSTES DE LA CARTERA' },
  Wallets: { fr: 'Portefeuilles', es: 'Carteras' },
  'Without it, your bitcoin cannot be recovered.': {
    fr: 'Sans elle, votre bitcoin ne peut pas être récupéré.',
    es: 'Sin ella, tu bitcoin no se puede recuperar.'
  }
} as const satisfies CatalogSection;

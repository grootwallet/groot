import type { CatalogSection } from './types';

export const settingsCopy = {
  '{walletName} settings': {
    fr: 'Réglages de {walletName}',
    es: 'Ajustes de {walletName}'
  },
  'APP SETTINGS': { fr: 'RÉGLAGES DE L’APP', es: 'AJUSTES DE LA APP' },
  'Wallet locked · App settings only.': {
    fr: 'Portefeuille verrouillé · Réglages de l’app uniquement.',
    es: 'Cartera bloqueada · Solo ajustes de la app.'
  },
  'Appearance and Bitcoin network.': {
    fr: 'Apparence et réseau Bitcoin.',
    es: 'Apariencia y red Bitcoin.'
  },
  'Wallet-specific network details are locked': {
    fr: 'Les détails réseau du portefeuille sont verrouillés',
    es: 'Los detalles de red de la cartera están bloqueados'
  },
  'Unlock the wallet to view its node route, sync source, credentials, or run a live connection check.':
    {
      fr: 'Déverrouillez le portefeuille pour afficher son nœud, sa source de synchronisation et ses identifiants, ou pour tester la connexion en direct.',
      es: 'Desbloquea la cartera para ver su nodo, fuente de sincronización y credenciales, o para probar la conexión en directo.'
    },
  'App logs': { fr: 'Journaux de l’app', es: 'Registros de la app' },
  'APP LOGS': { fr: 'JOURNAUX DE L’APP', es: 'REGISTROS DE LA APP' },
  'View app logs': { fr: 'Voir les journaux de l’app', es: 'Ver registros de la app' },
  Diagnostics: { fr: 'Diagnostics', es: 'Diagnóstico' },
  'APP DIAGNOSTICS': { fr: 'DIAGNOSTIC DE L’APP', es: 'DIAGNÓSTICO DE LA APP' },
  'Diagnostic event log': {
    fr: 'Journal des événements de diagnostic',
    es: 'Registro de eventos de diagnóstico'
  },
  'Review and export sanitized app events without wallet identifiers or secrets.': {
    fr: 'Consultez et exportez les événements assainis de l’app sans identifiants de portefeuille ni secrets.',
    es: 'Revisa y exporta eventos depurados de la app sin identificadores de cartera ni secretos.'
  },
  'Recorded event types': {
    fr: 'Types d’événements enregistrés',
    es: 'Tipos de eventos registrados'
  },
  'Only these durable lifecycle and operation categories are recorded. Sensitive values and passive polling are excluded.':
    {
      fr: 'Seules ces catégories durables de cycle de vie et d’opération sont enregistrées. Les valeurs sensibles et l’interrogation passive sont exclues.',
      es: 'Solo se registran estas categorías duraderas de ciclo de vida y operación. Se excluyen los valores sensibles y el sondeo pasivo.'
    },
  'Sanitized activity for troubleshooting.': {
    fr: 'Activité assainie pour le dépannage.',
    es: 'Actividad depurada para diagnóstico.'
  },
  'Diagnostic log summary': {
    fr: 'Résumé du journal de diagnostic',
    es: 'Resumen del registro de diagnóstico'
  },
  'App log summary': {
    fr: 'Résumé des journaux de l’app',
    es: 'Resumen de los registros de la app'
  },
  'Browse app logs': {
    fr: 'Parcourir les journaux de l’app',
    es: 'Explorar los registros de la app'
  },
  'Search logs': { fr: 'Rechercher dans les journaux', es: 'Buscar en los registros' },
  'Search events and safe context': {
    fr: 'Rechercher des événements et du contexte sûr',
    es: 'Buscar eventos y contexto seguro'
  },
  'All event types': {
    fr: 'Tous les types d’événements',
    es: 'Todos los tipos de eventos'
  },
  '{count} event types': {
    fr: '{count} types d’événements',
    es: '{count} tipos de eventos'
  },
  'All outcomes': { fr: 'Tous les résultats', es: 'Todos los resultados' },
  '{count} outcomes': { fr: '{count} résultats', es: '{count} resultados' },
  'Filter by outcome': { fr: 'Filtrer par résultat', es: 'Filtrar por resultado' },
  'Filter by event type': {
    fr: 'Filtrer par type d’événement',
    es: 'Filtrar por tipo de evento'
  },
  Done: { fr: 'Terminé', es: 'Listo' },
  'Date order': { fr: 'Ordre des dates', es: 'Orden de fecha' },
  'Newest first': { fr: 'Plus récents d’abord', es: 'Más recientes primero' },
  'Oldest first': { fr: 'Plus anciens d’abord', es: 'Más antiguos primero' },
  'Log view': { fr: 'Vue des journaux', es: 'Vista de registros' },
  Table: { fr: 'Tableau', es: 'Tabla' },
  'Raw JSON': { fr: 'JSON brut', es: 'JSON sin procesar' },
  'Showing {visible} of {total} events': {
    fr: 'Affichage de {visible} événements sur {total}',
    es: 'Mostrando {visible} de {total} eventos'
  },
  'No app logs match these filters.': {
    fr: 'Aucun journal de l’app ne correspond à ces filtres.',
    es: 'Ningún registro de la app coincide con estos filtros.'
  },
  'Clear filters': { fr: 'Effacer les filtres', es: 'Borrar filtros' },
  'The exact sanitized records shown by the current filters.': {
    fr: 'Les enregistrements assainis exacts affichés par les filtres actuels.',
    es: 'Los registros depurados exactos mostrados por los filtros actuales.'
  },
  'Raw app log JSON': {
    fr: 'JSON brut des journaux de l’app',
    es: 'JSON sin procesar de los registros de la app'
  },
  'Copy JSON': { fr: 'Copier le JSON', es: 'Copiar JSON' },
  'App logs copied': {
    fr: 'Journaux de l’app copiés',
    es: 'Registros de la app copiados'
  },
  'Could not copy app logs': {
    fr: 'Impossible de copier les journaux de l’app',
    es: 'No se pudieron copiar los registros de la app'
  },
  '{count} events': { fr: '{count} événements', es: '{count} eventos' },
  '{network} · {platform} · v{version} · {commit}': {
    fr: '{network} · {platform} · v{version} · {commit}',
    es: '{network} · {platform} · v{version} · {commit}'
  },
  'Stored locally as append-only JSONL. New records stop at the 16 MiB safety limit.': {
    fr: 'Stocké localement en JSONL à ajout seul. Les nouveaux enregistrements s’arrêtent à la limite de sécurité de 16 Mio.',
    es: 'Almacenado localmente como JSONL de solo anexado. Los nuevos registros se detienen en el límite de seguridad de 16 MiB.'
  },
  'Export CSV': { fr: 'Exporter en CSV', es: 'Exportar CSV' },
  'Export JSON': { fr: 'Exporter en JSON', es: 'Exportar JSON' },
  'Loading diagnostics…': { fr: 'Chargement du diagnostic…', es: 'Cargando diagnóstico…' },
  'Could not load diagnostics.': {
    fr: 'Impossible de charger le diagnostic.',
    es: 'No se pudo cargar el diagnóstico.'
  },
  'No diagnostic events have been recorded yet.': {
    fr: 'Aucun événement de diagnostic enregistré.',
    es: 'Aún no se registraron eventos de diagnóstico.'
  },
  'The sanitized diagnostic log was saved.': {
    fr: 'Le journal de diagnostic assaini a été enregistré.',
    es: 'Se guardó el registro de diagnóstico depurado.'
  },
  'The sanitized app logs were saved.': {
    fr: 'Les journaux assainis de l’app ont été enregistrés.',
    es: 'Se guardaron los registros depurados de la app.'
  },
  'Could not export diagnostics': {
    fr: 'Impossible d’exporter le diagnostic',
    es: 'No se pudo exportar el diagnóstico'
  },
  'Could not export app logs': {
    fr: 'Impossible d’exporter les journaux de l’app',
    es: 'No se pudieron exportar los registros de la app'
  },
  Time: { fr: 'Heure', es: 'Hora' },
  Event: { fr: 'Événement', es: 'Evento' },
  Outcome: { fr: 'Résultat', es: 'Resultado' },
  'Safe context': { fr: 'Contexte sûr', es: 'Contexto seguro' },
  'Error details': { fr: 'Détails de l’erreur', es: 'Detalles del error' },
  'Required block history is unavailable': {
    fr: 'L’historique de blocs requis est indisponible',
    es: 'El historial de bloques requerido no está disponible'
  },
  'Full rescan failed': { fr: 'Échec du rescannage complet', es: 'Falló el reescaneo completo' },
  'Wallet-history scan failed': {
    fr: 'Échec de l’analyse de l’historique du portefeuille',
    es: 'Falló el escaneo del historial de la cartera'
  },
  'Requested birthday': { fr: 'Anniversaire demandé', es: 'Fecha de creación solicitada' },
  'Required anchor': { fr: 'Ancrage requis', es: 'Ancla requerida' },
  'Bitcoin Core retains full blocks from': {
    fr: 'Bitcoin Core conserve les blocs complets à partir de',
    es: 'Bitcoin Core conserva bloques completos desde'
  },
  'Retained full blocks from': {
    fr: 'Blocs complets conservés à partir de',
    es: 'Bloques completos conservados desde'
  },
  'Earliest usable birthday': {
    fr: 'Premier anniversaire utilisable',
    es: 'Primera fecha de creación utilizable'
  },
  'Block {height}': { fr: 'Bloc {height}', es: 'Bloque {height}' },
  'App started': { fr: 'App démarrée', es: 'App iniciada' },
  'Wallet created': { fr: 'Portefeuille créé', es: 'Cartera creada' },
  'Wallet recovered': { fr: 'Portefeuille récupéré', es: 'Cartera recuperada' },
  'Wallet removed': { fr: 'Portefeuille supprimé', es: 'Cartera eliminada' },
  'Wallet unlocked': { fr: 'Portefeuille déverrouillé', es: 'Cartera desbloqueada' },
  'Wallet locked': { fr: 'Portefeuille verrouillé', es: 'Cartera bloqueada' },
  'Wallet sync': { fr: 'Synchronisation du portefeuille', es: 'Sincronización de cartera' },
  'Transaction prepared': { fr: 'Transaction préparée', es: 'Transacción preparada' },
  'Transaction signed': { fr: 'Transaction signée', es: 'Transacción firmada' },
  'Transaction broadcast': { fr: 'Transaction diffusée', es: 'Transacción transmitida' },
  'Receive address generated': {
    fr: 'Adresse de réception générée',
    es: 'Dirección de recepción generada'
  },
  receive_address_generated: {
    fr: 'receive_address_generated',
    es: 'receive_address_generated'
  },
  'Receive address discarded': {
    fr: 'Adresse de réception écartée',
    es: 'Dirección de recepción descartada'
  },
  'Receive address verified': {
    fr: 'Adresse de réception vérifiée',
    es: 'Dirección de recepción verificada'
  },
  'Coin frozen': { fr: 'Pièce gelée', es: 'Moneda congelada' },
  'Coin unfrozen': { fr: 'Pièce dégelée', es: 'Moneda descongelada' },
  'Backup exported': { fr: 'Sauvegarde exportée', es: 'Copia exportada' },
  'Backup imported': { fr: 'Sauvegarde importée', es: 'Copia importada' },
  'Backup verified': { fr: 'Sauvegarde vérifiée', es: 'Copia verificada' },
  'Recovery tested': { fr: 'Récupération testée', es: 'Recuperación probada' },
  'Network configuration changed': {
    fr: 'Configuration réseau modifiée',
    es: 'Configuración de red modificada'
  },
  'Diagnostics exported': { fr: 'Diagnostic exporté', es: 'Diagnóstico exportado' },
  'App logs exported': {
    fr: 'Journaux de l’app exportés',
    es: 'Registros de la app exportados'
  },
  started: { fr: 'démarré', es: 'iniciado' },
  progress: { fr: 'en cours', es: 'en curso' },
  succeeded: { fr: 'réussi', es: 'correcto' },
  failed: { fr: 'échoué', es: 'fallido' },
  cancelled: { fr: 'annulé', es: 'cancelado' },
  automatic: { fr: 'automatique', es: 'automático' },
  startup: { fr: 'démarrage', es: 'inicio' },
  'Trigger: {trigger}': { fr: 'Déclencheur : {trigger}', es: 'Origen: {trigger}' },
  '{count} permanent labels assigned': {
    fr: '{count} libellés permanents attribués',
    es: '{count} etiquetas permanentes asignadas'
  },
  '{count} items': { fr: '{count} éléments', es: '{count} elementos' },
  '{format} export': { fr: 'Export {format}', es: 'Exportación {format}' },
  software: { fr: 'logiciel', es: 'software' },
  hardware: { fr: 'matériel', es: 'hardware' },
  multisig: { fr: 'multisignature', es: 'multifirma' },
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
  'Outside Groot': { fr: 'Hors de Groot', es: 'Fuera de Groot' },
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
  'Policy and signer recovery': {
    fr: 'Récupération de la politique et des signataires',
    es: 'Recuperación de la política y los firmantes'
  },
  'Hardware signer recovery': {
    fr: 'Récupération du signataire matériel',
    es: 'Recuperación del firmante físico'
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
  'Signer backups should have been completed when each device was initialized. Export the public descriptor below.':
    {
      fr: 'Les sauvegardes des signataires doivent avoir été effectuées lors de l’initialisation de chaque appareil. Exportez le descripteur public ci-dessous.',
      es: 'Las copias de los firmantes deben haberse realizado al inicializar cada dispositivo. Exporta el descriptor público a continuación.'
    },
  'The recovery backup should have been completed when the signer was initialized. Groot cannot create or verify it.':
    {
      fr: 'La sauvegarde de récupération doit avoir été effectuée lors de l’initialisation du signataire. Groot ne peut ni la créer ni la vérifier.',
      es: 'La copia de recuperación debe haberse realizado al inicializar el firmante. Groot no puede crearla ni verificarla.'
    },
  'Keep both together. Recovery words can be re-presented only in the authenticated native backup flow; the wallet passphrase cannot be displayed or reset.':
    {
      fr: 'Conservez-les ensemble. Les mots de récupération ne peuvent être réaffichés que dans le flux de sauvegarde natif authentifié ; la phrase secrète du portefeuille ne peut être ni affichée ni réinitialisée.',
      es: 'Guárdalos juntos. Las palabras de recuperación solo pueden volver a mostrarse en el flujo nativo de copia autenticado; la frase de contraseña de la cartera no se puede mostrar ni restablecer.'
    },
  'Keyboard shortcuts': { fr: 'Raccourcis clavier', es: 'Atajos de teclado' },
  'Navigate and lock without leaving the keyboard.': {
    fr: 'Naviguez et verrouillez sans quitter le clavier.',
    es: 'Navega y bloquea sin dejar el teclado.'
  },
  'Lock wallet': { fr: 'Verrouiller le portefeuille', es: 'Bloquear cartera' },
  'Zoom in': { fr: 'Agrandir', es: 'Acercar' },
  'Zoom out': { fr: 'Réduire', es: 'Alejar' },
  'Reset zoom': { fr: 'Réinitialiser le zoom', es: 'Restablecer zoom' },
  'Wallet not locked': { fr: 'Portefeuille non verrouillé', es: 'Cartera no bloqueada' },
  'Could not lock this wallet.': {
    fr: 'Impossible de verrouiller ce portefeuille.',
    es: 'No se pudo bloquear esta cartera.'
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
  'Checking pending transactions…': {
    fr: 'Vérification des transactions en attente…',
    es: 'Comprobando transacciones pendientes…'
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
  'Fast remote sync sends this wallet’s public output scripts to the trusted server. The server can associate those scripts and wallet activity with your connection. No private keys, labels, or signing material are sent. Bitcoin Core 29+ and a synced basic block-filter index are required.':
    {
      fr: 'La synchronisation distante rapide envoie les scripts de sortie publics de ce portefeuille au serveur de confiance. Le serveur peut associer ces scripts et l’activité du portefeuille à votre connexion. Aucune clé privée, étiquette ou donnée de signature n’est envoyée. Bitcoin Core 29+ et un index de filtres de blocs de base entièrement synchronisé sont requis.',
      es: 'La sincronización remota rápida envía los scripts de salida públicos de esta cartera al servidor de confianza. El servidor puede asociar esos scripts y la actividad de la cartera con tu conexión. No se envían claves privadas, etiquetas ni material de firma. Se requieren Bitcoin Core 29+ y un índice básico de filtros de bloques totalmente sincronizado.'
    },
  'Local Core sync matches wallet activity on this Mac. A pruned node can sync while it still retains every block newer than this wallet’s checkpoint; an older rescan needs an archival node or a reindex/re-download with enough history.':
    {
      fr: 'La synchronisation Core locale recherche l’activité du portefeuille sur ce Mac. Un nœud élagué peut se synchroniser tant qu’il conserve chaque bloc plus récent que le point de contrôle du portefeuille ; une analyse plus ancienne nécessite un nœud d’archive ou une réindexation/un nouveau téléchargement avec suffisamment d’historique.',
      es: 'La sincronización Core local busca la actividad de la cartera en este Mac. Un nodo podado puede sincronizar mientras conserve todos los bloques posteriores al punto de control de la cartera; un escaneo más antiguo necesita un nodo de archivo o una reindexación/nueva descarga con suficiente historial.'
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
  'About the address gap limit': {
    fr: 'À propos de la limite d’écart des adresses',
    es: 'Acerca del límite de intervalo de direcciones'
  },
  'About wallet birthday blocks': {
    fr: 'À propos des blocs de naissance du portefeuille',
    es: 'Acerca de los bloques de nacimiento de la cartera'
  },
  'Birthday block must be at or below the current chain tip.': {
    fr: 'Le bloc de naissance doit être inférieur ou égal à la pointe actuelle de la chaîne.',
    es: 'El bloque de nacimiento debe ser igual o anterior a la punta actual de la cadena.'
  },
  'Current {network} chain tip: block {height}': {
    fr: 'Pointe actuelle de la chaîne {network} : bloc {height}',
    es: 'Punta actual de la cadena {network}: bloque {height}'
  },
  'Full blocks available from {height}. Choose a birthday after this block.': {
    fr: 'Blocs complets disponibles depuis {height}. Choisissez un bloc de naissance après ce bloc.',
    es: 'Bloques completos disponibles desde {height}. Elige un bloque de nacimiento posterior.'
  },
  'Retained block range unavailable. Check the node connection and reopen this dialog.': {
    fr: 'Plage de blocs conservés indisponible. Vérifiez la connexion au nœud et rouvrez cette fenêtre.',
    es: 'Rango de bloques conservados no disponible. Comprueba la conexión al nodo y vuelve a abrir este diálogo.'
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
  'Bitcoin Core connection': {
    fr: 'Connexion à Bitcoin Core',
    es: 'Conexión a Bitcoin Core'
  },
  'Groot managed · activity, fees, and broadcast': {
    fr: 'Géré par Groot · activité, frais et diffusion',
    es: 'Gestionado por Groot · actividad, comisiones y difusión'
  },
  'This Mac · activity, fees, and broadcast': {
    fr: 'Ce Mac · activité, frais et diffusion',
    es: 'Este Mac · actividad, comisiones y difusión'
  },
  'Custom remote · activity, fees, and broadcast': {
    fr: 'Distant personnalisé · activité, frais et diffusion',
    es: 'Remoto personalizado · actividad, comisiones y difusión'
  },
  'Groot managed · fees and broadcast': {
    fr: 'Géré par Groot · frais et diffusion',
    es: 'Gestionado por Groot · comisiones y difusión'
  },
  'This Mac · fees and broadcast': {
    fr: 'Ce Mac · frais et diffusion',
    es: 'Este Mac · comisiones y difusión'
  },
  'Custom remote · fees and broadcast': {
    fr: 'Distant personnalisé · frais et diffusion',
    es: 'Remoto personalizado · comisiones y difusión'
  },
  'Use compact filters for wallet activity': {
    fr: 'Utiliser les filtres compacts pour l’activité du portefeuille',
    es: 'Usar filtros compactos para la actividad de la cartera'
  },
  'Optional on rehearsal networks. Bitcoin Core still provides fees and broadcast.': {
    fr: 'Optionnel sur les réseaux de répétition. Bitcoin Core fournit toujours les frais et la diffusion.',
    es: 'Opcional en redes de ensayo. Bitcoin Core sigue proporcionando comisiones y difusión.'
  },
  'Groot managed': { fr: 'Géré par Groot', es: 'Gestionado por Groot' },
  'Groot managed node': { fr: 'Nœud géré par Groot', es: 'Nodo gestionado por Groot' },
  'Custom remote': { fr: 'Distant personnalisé', es: 'Remoto personalizado' },
  'Custom remote node': { fr: 'Nœud distant personnalisé', es: 'Nodo remoto personalizado' },
  'Groot provisions isolated access for this wallet. RPC credentials stay encrypted in native code and are never shown here.':
    {
      fr: 'Groot fournit un accès isolé pour ce portefeuille. Les identifiants RPC restent chiffrés dans le code natif et ne sont jamais affichés ici.',
      es: 'Groot proporciona acceso aislado para esta cartera. Las credenciales RPC permanecen cifradas en el código nativo y nunca se muestran aquí.'
    },
  'Privacy tradeoff': {
    fr: 'Compromis de confidentialité',
    es: 'Compromiso de privacidad'
  },
  'The service sees connection timing and wallet scripts queried for history. Recovery words, private keys, and labels stay on this device.':
    {
      fr: 'Le service voit les horaires de connexion et les scripts du portefeuille interrogés pour l’historique. Les mots de récupération, clés privées et libellés restent sur cet appareil.',
      es: 'El servicio ve los tiempos de conexión y los scripts de la cartera consultados para el historial. Las palabras de recuperación, claves privadas y etiquetas permanecen en este dispositivo.'
    },
  'Renew managed access': { fr: 'Renouveler l’accès géré', es: 'Renovar acceso gestionado' },
  'Check managed status': { fr: 'Vérifier l’état géré', es: 'Comprobar estado gestionado' },
  'Managed-node access renewed': {
    fr: 'Accès au nœud géré renouvelé',
    es: 'Acceso al nodo gestionado renovado'
  },
  'Groot node connected': { fr: 'Nœud Groot connecté', es: 'Nodo Groot conectado' },
  'Groot provisioned new wallet-specific access without exposing credentials.': {
    fr: 'Groot a fourni un nouvel accès propre au portefeuille sans exposer les identifiants.',
    es: 'Groot proporcionó un nuevo acceso específico para la cartera sin exponer credenciales.'
  },
  'Use Groot managed node': {
    fr: 'Utiliser le nœud géré par Groot',
    es: 'Usar el nodo gestionado por Groot'
  },
  'Bitcoin network': { fr: 'Réseau Bitcoin', es: 'Red de Bitcoin' },
  'Switching restarts Groot. Each network keeps separate wallets and settings.': {
    fr: 'Changer de réseau redémarre Groot. Chaque réseau garde ses portefeuilles et réglages séparés.',
    es: 'Cambiar de red reinicia Groot. Cada red mantiene sus carteras y ajustes separados.'
  },
  'Fixed to {network}.': {
    fr: 'Réseau fixe : {network}.',
    es: 'Red fija: {network}.'
  },
  'Switch to {network}?': {
    fr: 'Passer à {network} ?',
    es: '¿Cambiar a {network}?'
  },
  'Groot will restart and open only the wallets and node settings saved for that network.': {
    fr: 'Groot redémarrera et ouvrira uniquement les portefeuilles et réglages de nœud enregistrés pour ce réseau.',
    es: 'Groot se reiniciará y abrirá únicamente las carteras y los ajustes del nodo guardados para esa red.'
  },
  'Mainnet uses real bitcoin.': {
    fr: 'Mainnet utilise de vrais bitcoins.',
    es: 'Mainnet usa bitcoins reales.'
  },
  'Confirm the Bitcoin Core network and every address before receiving, signing, or broadcasting.':
    {
      fr: 'Vérifiez le réseau de Bitcoin Core et chaque adresse avant de recevoir, signer ou diffuser.',
      es: 'Verifica la red de Bitcoin Core y cada dirección antes de recibir, firmar o transmitir.'
    },
  'The current network stays unchanged on disk. Switching back restores its wallets exactly as they were.':
    {
      fr: 'Le réseau actuel reste inchangé sur le disque. Y revenir restaure ses portefeuilles exactement dans leur état précédent.',
      es: 'La red actual permanece sin cambios en el disco. Al volver, sus carteras se restauran exactamente como estaban.'
    },
  'Restart in {network}': {
    fr: 'Redémarrer sur {network}',
    es: 'Reiniciar en {network}'
  },
  'Restarting…': { fr: 'Redémarrage…', es: 'Reiniciando…' },
  'Groot could not save the Bitcoin network selection.': {
    fr: 'Groot n’a pas pu enregistrer le choix du réseau Bitcoin.',
    es: 'Groot no pudo guardar la selección de red de Bitcoin.'
  },
  'Network not changed': {
    fr: 'Réseau non modifié',
    es: 'Red sin cambios'
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
  'Your recovery words stay private': {
    fr: 'Vos mots de récupération restent privés',
    es: 'Tus palabras de recuperación siguen siendo privadas'
  },
  'Groot checks them securely on this device.': {
    fr: 'Groot les vérifie en toute sécurité sur cet appareil.',
    es: 'Groot las comprueba de forma segura en este dispositivo.'
  },
  'About recovery-word privacy': {
    fr: 'À propos de la confidentialité des mots de récupération',
    es: 'Acerca de la privacidad de las palabras de recuperación'
  },
  'Groot reveals and verifies the words in a separate trusted native window. They never enter the webview or leave this device.':
    {
      fr: 'Groot affiche et vérifie les mots dans une fenêtre native de confiance distincte. Ils n’entrent jamais dans la vue web et ne quittent pas cet appareil.',
      es: 'Groot muestra y verifica las palabras en una ventana nativa de confianza independiente. Nunca entran en la vista web ni salen de este dispositivo.'
    },
  'Remote TLS': { fr: 'TLS distant', es: 'TLS remoto' },
  'Remove only': { fr: 'Supprimer uniquement', es: 'Solo eliminar' },
  'Required peers': { fr: 'Pairs requis', es: 'Pares requeridos' },
  'RPC URL': { fr: 'URL RPC', es: 'URL RPC' },
  'RPC username': { fr: 'Nom d’utilisateur RPC', es: 'Usuario RPC' },
  'Save & rescan': { fr: 'Enregistrer et analyser', es: 'Guardar y volver a escanear' },
  'Full rescan cancelled': {
    fr: 'Nouvelle analyse complète annulée',
    es: 'Reescaneo completo cancelado'
  },
  'No scan progress was kept. The next full rescan will start fresh.': {
    fr: 'Aucune progression n’a été conservée. La prochaine analyse complète repartira de zéro.',
    es: 'No se conservó el progreso. El próximo reescaneo completo comenzará de nuevo.'
  },
  'Reading current chain tip…': {
    fr: 'Lecture de la pointe actuelle de la chaîne…',
    es: 'Leyendo la punta actual de la cadena…'
  },
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
  'Use 0 when uncertain. Earlier scans are safer but take longer.': {
    fr: 'Utilisez 0 en cas de doute. Une analyse plus ancienne est plus sûre, mais prend plus de temps.',
    es: 'Usa 0 si no estás seguro. Un escaneo más antiguo es más seguro, pero tarda más.'
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
  'Unlock first': { fr: 'Déverrouiller d’abord', es: 'Desbloquear primero' },
  'Unlock the source wallet first': {
    fr: 'Déverrouillez d’abord le portefeuille source',
    es: 'Desbloquea primero la cartera de origen'
  },
  'Open that wallet, unlock it, then return here.': {
    fr: 'Ouvrez ce portefeuille, déverrouillez-le, puis revenez ici.',
    es: 'Abre esa cartera, desbloquéala y vuelve aquí.'
  },
  'About copied network credentials': {
    fr: 'À propos des identifiants réseau copiés',
    es: 'Acerca de las credenciales de red copiadas'
  },
  'Saved node credentials stay in Groot’s trusted native code and never appear on this screen.': {
    fr: 'Les identifiants du nœud restent dans le code natif de confiance de Groot et ne sont jamais affichés sur cet écran.',
    es: 'Las credenciales del nodo permanecen en el código nativo de confianza de Groot y nunca aparecen en esta pantalla.'
  },
  Ready: { fr: 'Prêt', es: 'Listo' },
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
  'The first block Groot will inspect. Choose a height at or before the wallet’s first possible payment.':
    {
      fr: 'Le premier bloc que Groot inspectera. Choisissez une hauteur antérieure ou égale au premier paiement possible du portefeuille.',
      es: 'El primer bloque que Groot inspeccionará. Elige una altura igual o anterior al primer pago posible de la cartera.'
    },
  'How many consecutive unused addresses Groot derives while searching for wallet activity. Increase it only for wallets that revealed long unused address runs.':
    {
      fr: 'Nombre d’adresses inutilisées consécutives que Groot dérive lors de la recherche d’activité. Augmentez-le uniquement pour les portefeuilles ayant révélé de longues séries d’adresses inutilisées.',
      es: 'Cuántas direcciones consecutivas sin usar deriva Groot al buscar actividad. Auméntalo solo para carteras que hayan revelado largas series de direcciones sin usar.'
    },
  'Wallet deletion': { fr: 'Suppression du portefeuille', es: 'Eliminación de la cartera' },
  'Wallet details': { fr: 'Détails du portefeuille', es: 'Detalles de la cartera' },
  'Wallet name': { fr: 'Nom du portefeuille', es: 'Nombre de la cartera' },
  'Security and connection for this wallet.': {
    fr: 'Sécurité et connexion de ce portefeuille.',
    es: 'Seguridad y conexión de esta cartera.'
  },
  'WALLET SETTINGS': { fr: 'RÉGLAGES DU PORTEFEUILLE', es: 'AJUSTES DE LA CARTERA' },
  Wallets: { fr: 'Portefeuilles', es: 'Carteras' },
  'BIP329 wallet labels': {
    fr: 'Libellés de portefeuille BIP329',
    es: 'Etiquetas BIP329 de la cartera'
  },
  'Could not export labels': {
    fr: 'Impossible d’exporter les libellés',
    es: 'No se pudieron exportar las etiquetas'
  },
  'Could not import labels': {
    fr: 'Impossible d’importer les libellés',
    es: 'No se pudieron importar las etiquetas'
  },
  'Export JSONL': { fr: 'Exporter JSONL', es: 'Exportar JSONL' },
  'Import JSONL': { fr: 'Importer JSONL', es: 'Importar JSONL' },
  'Import or export wallet labels': {
    fr: 'Importer ou exporter les libellés du portefeuille',
    es: 'Importar o exportar etiquetas de la cartera'
  },
  'Import is additive and atomic. Existing permanent labels are never overwritten; a conflict leaves the wallet unchanged.':
    {
      fr: 'L’import est additif et atomique. Les libellés permanents existants ne sont jamais remplacés ; un conflit laisse le portefeuille inchangé.',
      es: 'La importación es aditiva y atómica. Las etiquetas permanentes existentes nunca se sobrescriben; un conflicto deja la cartera sin cambios.'
    },
  'Imported {imported}; {unchanged} already present; {ignored} unsupported; {spendability} coin settings changed.':
    {
      fr: '{imported} importés ; {unchanged} déjà présents ; {ignored} non pris en charge ; {spendability} réglages de pièces modifiés.',
      es: '{imported} importadas; {unchanged} ya presentes; {ignored} no compatibles; {spendability} ajustes de monedas modificados.'
    },
  'Labels exported': { fr: 'Libellés exportés', es: 'Etiquetas exportadas' },
  'Could not show saved labels': {
    fr: 'Impossible d’afficher les libellés enregistrés',
    es: 'No se pudieron mostrar las etiquetas guardadas'
  },
  'Labels imported': { fr: 'Libellés importés', es: 'Etiquetas importadas' },
  'Last label operation': {
    fr: 'Dernière opération sur les libellés',
    es: 'Última operación de etiquetas'
  },
  'Move compatible labels without changing this wallet’s keys or descriptors.': {
    fr: 'Déplacez les libellés compatibles sans modifier les clés ni les descripteurs de ce portefeuille.',
    es: 'Transfiere etiquetas compatibles sin cambiar las claves ni los descriptores de esta cartera.'
  },
  'Private financial metadata': {
    fr: 'Métadonnées financières privées',
    es: 'Metadatos financieros privados'
  },
  'Saved {count} BIP329 label records.': {
    fr: '{count} enregistrements de libellés BIP329 enregistrés.',
    es: 'Se guardaron {count} registros de etiquetas BIP329.'
  },
  'This file can reveal your wallet activity. Keep it private.': {
    fr: 'Ce fichier peut révéler l’activité de votre portefeuille. Gardez-le privé.',
    es: 'Este archivo puede revelar la actividad de tu cartera. Mantenlo privado.'
  },
  'About label-file privacy': {
    fr: 'À propos de la confidentialité du fichier de libellés',
    es: 'Acerca de la privacidad del archivo de etiquetas'
  },
  'A BIP329 file can include labels, addresses, transaction references, public account keys, and links in your wallet history. Store and transfer it privately, then delete copies you no longer need.':
    {
      fr: 'Un fichier BIP329 peut contenir des libellés, des adresses, des références de transaction, des clés de compte publiques et des liens dans l’historique du portefeuille. Stockez-le et transférez-le de manière privée, puis supprimez les copies inutiles.',
      es: 'Un archivo BIP329 puede incluir etiquetas, direcciones, referencias de transacciones, claves públicas de cuenta y vínculos del historial. Guárdalo y transfiérelo de forma privada, y elimina las copias que ya no necesites.'
    },
  'Use the BIP329 JSONL format with another compatible wallet.': {
    fr: 'Utilisez le format JSONL BIP329 avec un autre portefeuille compatible.',
    es: 'Usa el formato JSONL BIP329 con otra cartera compatible.'
  },
  'Working…': { fr: 'Traitement…', es: 'Procesando…' },
  'Without it, your bitcoin cannot be recovered.': {
    fr: 'Sans elle, votre bitcoin ne peut pas être récupéré.',
    es: 'Sin ella, tu bitcoin no se puede recuperar.'
  }
} as const satisfies CatalogSection;

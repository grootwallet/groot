import type { CatalogSection } from './types';

export const multisigCopy = {
  '{subject} needs exactly {count} signers.': {
    fr: '{subject} nécessite exactement {count} signataires.',
    es: '{subject} necesita exactamente {count} firmantes.'
  },
  'This wallet': { fr: 'Ce portefeuille', es: 'Esta cartera' },
  'This template': { fr: 'Ce modèle', es: 'Esta plantilla' },
  'A descriptor is a public, watch-only recipe that defines the signing policy and derives every receive and change address. It cannot spend bitcoin, but it reveals the wallet’s complete address history, so keep it private and back it up.':
    {
      fr: 'Un descripteur est une recette publique en lecture seule qui définit la politique de signature et dérive chaque adresse de réception et de monnaie. Il ne peut pas dépenser de bitcoin, mais il révèle tout l’historique des adresses du portefeuille ; conservez-le donc en privé et sauvegardez-le.',
      es: 'Un descriptor es una receta pública de solo lectura que define la política de firma y deriva cada dirección de recepción y cambio. No puede gastar bitcoin, pero revela todo el historial de direcciones de la cartera; mantenlo privado y guárdalo como copia de seguridad.'
    },
  'BSMS is a portable public descriptor record supported by compatible coordinators. Groot JSON also preserves Groot-specific labels and metadata. Neither contains private keys.':
    {
      fr: 'BSMS est un enregistrement portable de descripteur public pris en charge par les coordinateurs compatibles. Le JSON Groot conserve également les libellés et métadonnées propres à Groot. Aucun des deux ne contient de clés privées.',
      es: 'BSMS es un registro portátil de descriptor público compatible con coordinadores compatibles. El JSON de Groot también conserva las etiquetas y los metadatos propios de Groot. Ninguno contiene claves privadas.'
    },
  'Groot safely imports the watch-only backup in memory and proves it derives the same first address. It never signs or moves bitcoin.':
    {
      fr: 'Groot importe en mémoire la sauvegarde en lecture seule de manière sécurisée et vérifie qu’elle dérive la même première adresse. Il ne signe ni ne déplace jamais de bitcoin.',
      es: 'Groot importa de forma segura en memoria la copia de solo lectura y comprueba que deriva la misma primera dirección. Nunca firma ni mueve bitcoin.'
    },
  'Add {count} more signer.': {
    fr: 'Ajoutez encore {count} signataire.',
    es: 'Añade {count} firmante más.'
  },
  'Add {count} more signers.': {
    fr: 'Ajoutez encore {count} signataires.',
    es: 'Añade {count} firmantes más.'
  },
  'Remove {count} signer.': { fr: 'Retirez {count} signataire.', es: 'Elimina {count} firmante.' },
  'Remove {count} signers.': {
    fr: 'Retirez {count} signataires.',
    es: 'Elimina {count} firmantes.'
  },
  'Fingerprint {fingerprint} is already used by “{label}”.': {
    fr: 'L’empreinte {fingerprint} est déjà utilisée par « {label} ».',
    es: 'La huella {fingerprint} ya la usa «{label}».'
  },
  'This account xpub is already used by “{label}”.': {
    fr: 'Cette xpub de compte est déjà utilisée par « {label} ».',
    es: 'Esta xpub de cuenta ya la usa «{label}».'
  },
  'This signer is already added as “{label}” (fingerprint {fingerprint}).': {
    fr: 'Ce signataire est déjà ajouté sous le nom « {label} » (empreinte {fingerprint}).',
    es: 'Este firmante ya está añadido como «{label}» (huella {fingerprint}).'
  },
  '{signerName} registered the policy and verified its first address.': {
    fr: '{signerName} a enregistré la politique et vérifié sa première adresse.',
    es: '{signerName} registró la política y verificó su primera dirección.'
  },
  'This signer is now “{label}”.': {
    fr: 'Ce signataire s’appelle maintenant « {label} ».',
    es: 'Este firmante ahora se llama «{label}».'
  },
  'Returned to {stage}.': { fr: 'Retour à l’étape {stage}.', es: 'Se volvió a {stage}.' },
  '{signerName} was loaded from a local file.': {
    fr: '{signerName} a été chargé depuis un fichier local.',
    es: '{signerName} se cargó desde un archivo local.'
  },
  '{signerName} was removed from this unfinished wallet.': {
    fr: '{signerName} a été retiré de ce portefeuille inachevé.',
    es: '{signerName} se eliminó de esta cartera sin terminar.'
  },
  '{signed} of {required} signatures': {
    fr: '{signed} signatures sur {required}',
    es: '{signed} de {required} firmas'
  },
  '{signed} of {required} signatures remain': {
    fr: '{signed} signatures sur {required} restantes',
    es: 'Quedan {signed} de {required} firmas'
  },
  Signers: { fr: 'Signataires', es: 'Firmantes' },
  Verify: { fr: 'Vérification', es: 'Verificación' },
  'Back up': { fr: 'Sauvegarde', es: 'Copia de seguridad' },
  'signatures are required to spend.': {
    fr: 'signatures sont requises pour dépenser.',
    es: 'firmas son necesarias para gastar.'
  },
  '’s app PIN. This protects access to private financial metadata even while the wallet screen is open. The exported descriptor is not encrypted: it cannot spend, but it reveals addresses and should remain private.':
    {
      fr: '. Cela protège l’accès aux métadonnées financières privées même lorsque l’écran du portefeuille est ouvert. Le descripteur exporté n’est pas chiffré : il ne peut pas dépenser, mais il révèle les adresses et doit rester privé.',
      es: '. Esto protege el acceso a metadatos financieros privados incluso con la pantalla de la cartera abierta. El descriptor exportado no está cifrado: no puede gastar, pero revela direcciones y debe mantenerse privado.'
    },
  '1 signature': { fr: '1 signature', es: '1 firma' },
  '1. Export and test recovery': {
    fr: '1. Exporter et tester la récupération',
    es: '1. Exportar y probar la recuperación'
  },
  '1. Export backup': { fr: '1. Exporter la sauvegarde', es: '1. Exportar copia de seguridad' },
  '2. Delete local wallet': {
    fr: '2. Supprimer le portefeuille local',
    es: '2. Eliminar cartera local'
  },
  '2. Test recovery': { fr: '2. Tester la récupération', es: '2. Probar recuperación' },
  'A mismatch means this is not the wallet you intended to recover.': {
    fr: 'Une différence signifie qu’il ne s’agit pas du portefeuille que vous souhaitiez récupérer.',
    es: 'Una diferencia significa que no es la cartera que querías recuperar.'
  },
  'A public descriptor backup reconstructs this wallet without exposing signing keys.': {
    fr: 'Une sauvegarde du descripteur public reconstruit ce portefeuille sans exposer les clés de signature.',
    es: 'Una copia del descriptor público reconstruye esta cartera sin exponer las claves de firma.'
  },
  'A watch-only wallet whose spending policy is enforced by independent keys.': {
    fr: 'Un portefeuille d’observation dont la politique de dépense est imposée par des clés indépendantes.',
    es: 'Una cartera de solo lectura cuya política de gasto se aplica mediante claves independientes.'
  },
  'Active path requires': { fr: 'Le chemin actif requiert', es: 'La ruta activa requiere' },
  'Add another wallet': { fr: 'Ajouter un autre portefeuille', es: 'Añadir otra cartera' },
  'Already signed': { fr: 'Déjà signée', es: 'Ya firmada' },
  'Authorize & prepare backup': {
    fr: 'Autoriser et préparer la sauvegarde',
    es: 'Autorizar y preparar copia'
  },
  'Authorize a public, watch-only copy of this wallet.': {
    fr: 'Autorisez une copie publique d’observation de ce portefeuille.',
    es: 'Autoriza una copia pública de solo lectura de esta cartera.'
  },
  'Back to overview': { fr: 'Retour à l’aperçu', es: 'Volver al resumen' },
  'Back to settings': { fr: 'Retour aux réglages', es: 'Volver a ajustes' },
  'Backup does not match': {
    fr: 'La sauvegarde ne correspond pas',
    es: 'La copia de seguridad no coincide'
  },
  'Backup formats': { fr: 'Formats de sauvegarde', es: 'Formatos de copia de seguridad' },
  'Backup is valid': { fr: 'La sauvegarde est valide', es: 'La copia de seguridad es válida' },
  'Backups & recovery': {
    fr: 'Sauvegardes et récupération',
    es: 'Copias de seguridad y recuperación'
  },
  'Block-based delays': { fr: 'Délais basés sur les blocs', es: 'Demoras basadas en bloques' },
  Checked: { fr: 'Contrôlé', es: 'Comprobado' },
  'Checksummed WSH descriptor · maximum satisfaction': {
    fr: 'Descripteur WSH avec somme de contrôle · satisfaction maximale',
    es: 'Descriptor WSH con suma de comprobación · satisfacción máxima'
  },
  'Compile & analyze policy': {
    fr: 'Compiler et analyser la politique',
    es: 'Compilar y analizar política'
  },
  'Compile shows the resulting public descriptors and spending paths. To use a policy, create and back up a separate recovery wallet.':
    {
      fr: 'La compilation affiche les descripteurs publics et chemins de dépense obtenus. Pour utiliser une politique, créez et sauvegardez un portefeuille de récupération distinct.',
      es: 'La compilación muestra los descriptores públicos y las rutas de gasto resultantes. Para usar una política, crea y guarda una cartera de recuperación separada.'
    },
  'Compiled policy': { fr: 'Politique compilée', es: 'Política compilada' },
  'Complete step 1 before deletion can be authorized.': {
    fr: 'Terminez l’étape 1 avant d’autoriser la suppression.',
    es: 'Completa el paso 1 antes de autorizar la eliminación.'
  },
  'Confirm this backup reconstructs the same wallet before relying on it.': {
    fr: 'Confirmez que cette sauvegarde reconstruit le même portefeuille avant de vous y fier.',
    es: 'Confirma que esta copia reconstruye la misma cartera antes de confiar en ella.'
  },
  'Continue to wallet deletion': {
    fr: 'Continuer vers la suppression du portefeuille',
    es: 'Continuar a la eliminación de la cartera'
  },
  'Copy backup': { fr: 'Copier la sauvegarde', es: 'Copiar copia de seguridad' },
  'Create a multisig wallet first': {
    fr: 'Créez d’abord un portefeuille multisignature',
    es: 'Crea primero una cartera multifirma'
  },
  'Create recovery wallet': {
    fr: 'Créer un portefeuille de récupération',
    es: 'Crear cartera de recuperación'
  },
  'Decaying multisig': { fr: 'Multisignature décroissante', es: 'Multifirma decreciente' },
  'Delete permanently': { fr: 'Supprimer définitivement', es: 'Eliminar permanentemente' },
  'Delete wallet from this device': {
    fr: 'Supprimer le portefeuille de cet appareil',
    es: 'Eliminar la cartera de este dispositivo'
  },
  'Descriptor · Miniscript': { fr: 'Descripteur · Miniscript', es: 'Descriptor · Miniscript' },
  'Descriptor backup': { fr: 'Sauvegarde du descripteur', es: 'Copia del descriptor' },
  'DESCRIPTOR RECOVERY': { fr: 'RÉCUPÉRATION PAR DESCRIPTEUR', es: 'RECUPERACIÓN CON DESCRIPTOR' },
  'Descriptors plus Groot metadata': {
    fr: 'Descripteurs et métadonnées Groot',
    es: 'Descriptores y metadatos de Groot'
  },
  Download: { fr: 'Télécharger', es: 'Descargar' },
  exactly: { fr: 'exactement', es: 'exactamente' },
  'Expanding multisig': { fr: 'Multisignature croissante', es: 'Multifirma creciente' },
  'Expanding multisig needs an additional key that is not eligible in the immediate path.': {
    fr: 'La multisignature croissante requiert une clé supplémentaire qui n’est pas admissible dans le chemin immédiat.',
    es: 'La multifirma creciente necesita una clave adicional que no puede usarse en la ruta inmediata.'
  },
  'Experimental analysis only': {
    fr: 'Analyse expérimentale uniquement',
    es: 'Solo análisis experimental'
  },
  'Explore guided Miniscript paths': {
    fr: 'Explorer les chemins Miniscript guidés',
    es: 'Explorar rutas guiadas de Miniscript'
  },
  'Export the public descriptors before continuing.': {
    fr: 'Exportez les descripteurs publics avant de continuer.',
    es: 'Exporta los descriptores públicos antes de continuar.'
  },
  'Export wallet backup': {
    fr: 'Exporter la sauvegarde du portefeuille',
    es: 'Exportar copia de la cartera'
  },
  'Final confirmation': { fr: 'Confirmation finale', es: 'Confirmación final' },
  'Groot · Public wallet backup': {
    fr: 'Groot · Sauvegarde publique du portefeuille',
    es: 'Groot · Copia pública de la cartera'
  },
  'Groot JSON': { fr: 'JSON Groot', es: 'JSON de Groot' },
  'Guided recovery policy': {
    fr: 'Politique de récupération guidée',
    es: 'Política de recuperación guiada'
  },
  'I verified the first receive address': {
    fr: 'J’ai vérifié la première adresse de réception',
    es: 'He verificado la primera dirección de recepción'
  },
  'Keep wallet': { fr: 'Conserver le portefeuille', es: 'Conservar cartera' },
  'keys. Open a signer to inspect its identity, health, and wallet-policy status.': {
    fr: 'clés. Ouvrez un signataire pour inspecter son identité, son état et le statut de sa politique de portefeuille.',
    es: 'claves. Abre un firmante para inspeccionar su identidad, estado y situación de la política de cartera.'
  },
  'listed keys can spend': {
    fr: 'clés indiquées peuvent dépenser',
    es: 'claves indicadas pueden gastar'
  },
  'Maximum delay: 52,560 blocks': {
    fr: 'Délai maximal : 52 560 blocs',
    es: 'Demora máxima: 52.560 bloques'
  },
  'Minimum delay: 144 blocks': {
    fr: 'Délai minimal : 144 blocs',
    es: 'Demora mínima: 144 bloques'
  },
  'Most interoperable · recommended': {
    fr: 'Le plus interopérable · recommandé',
    es: 'Mayor interoperabilidad · recomendado'
  },
  'Native SegWit ·': { fr: 'SegWit natif ·', es: 'SegWit nativo ·' },
  'Native SegWit · sortedmulti': {
    fr: 'SegWit natif · sortedmulti',
    es: 'SegWit nativo · sortedmulti'
  },
  'Need a backup?': { fr: 'Besoin d’une sauvegarde ?', es: '¿Necesitas una copia de seguridad?' },
  'No multisig wallet selected': {
    fr: 'Aucun portefeuille multisignature sélectionné',
    es: 'No hay ninguna cartera multifirma seleccionada'
  },
  'One more signer is required.': {
    fr: 'Un signataire supplémentaire est requis.',
    es: 'Se necesita un firmante más.'
  },
  'Paste instead': { fr: 'Coller à la place', es: 'Pegar en su lugar' },
  PIN: { fr: 'PIN', es: 'PIN' },
  'Policy verified': { fr: 'Politique vérifiée', es: 'Política verificada' },
  'Preview reviewed Miniscript templates in Rust. This lab never changes the selected wallet.': {
    fr: 'Prévisualisez dans Rust des modèles Miniscript examinés. Ce laboratoire ne modifie jamais le portefeuille sélectionné.',
    es: 'Previsualiza en Rust plantillas de Miniscript revisadas. Este laboratorio nunca cambia la cartera seleccionada.'
  },
  'Privacy note': { fr: 'Note de confidentialité', es: 'Nota de privacidad' },
  'Public backup ready': { fr: 'Sauvegarde publique prête', es: 'Copia pública lista' },
  'Public descriptor files do not include private labels. Signers will be named Signer 1, Signer 2, and so on.':
    {
      fr: 'Les fichiers de descripteurs publics n’incluent pas les libellés privés. Les signataires seront nommés Signataire 1, Signataire 2, etc.',
      es: 'Los archivos de descriptores públicos no incluyen etiquetas privadas. Los firmantes se llamarán Firmante 1, Firmante 2, etc.'
    },
  'QR unavailable for this descriptor size. Use the downloaded file.': {
    fr: 'QR indisponible pour cette taille de descripteur. Utilisez le fichier téléchargé.',
    es: 'El QR no está disponible para este tamaño de descriptor. Usa el archivo descargado.'
  },
  'Re-authenticate this export': {
    fr: 'Réautoriser cet export',
    es: 'Volver a autenticar esta exportación'
  },
  'Ready-to-test demo wallet': {
    fr: 'Portefeuille de démonstration prêt à tester',
    es: 'Cartera de demostración lista para probar'
  },
  'Receive descriptor QR': {
    fr: 'QR du descripteur de réception',
    es: 'QR del descriptor de recepción'
  },
  'Recover multisig wallet': {
    fr: 'Récupérer un portefeuille multisignature',
    es: 'Recuperar cartera multifirma'
  },
  'Recovery analysis needs a shared wallet with independent signing keys.': {
    fr: 'L’analyse de récupération nécessite un portefeuille partagé avec des clés de signature indépendantes.',
    es: 'El análisis de recuperación necesita una cartera compartida con claves de firma independientes.'
  },
  'Recovery cannot reuse one of this wallet’s operational signers. Create a recovery wallet with three primary keys plus an independent fourth key.':
    {
      fr: 'La récupération ne peut pas réutiliser l’un des signataires opérationnels de ce portefeuille. Créez un portefeuille de récupération avec trois clés principales et une quatrième clé indépendante.',
      es: 'La recuperación no puede reutilizar uno de los firmantes operativos de esta cartera. Crea una cartera de recuperación con tres claves principales y una cuarta clave independiente.'
    },
  'Recovery confirmed': { fr: 'Récupération confirmée', es: 'Recuperación confirmada' },
  'Recovery policy lab': {
    fr: 'Laboratoire de politique de récupération',
    es: 'Laboratorio de política de recuperación'
  },
  'Recovery signatures': { fr: 'Signatures de récupération', es: 'Firmas de recuperación' },
  'Recovery test required': {
    fr: 'Test de récupération requis',
    es: 'Se requiere una prueba de recuperación'
  },
  'Recovery tested': { fr: 'Récupération testée', es: 'Recuperación probada' },
  'Relative timelocks start independently when each UTXO confirms. Calendar estimates are approximate and never determine spendability.':
    {
      fr: 'Les délais relatifs démarrent indépendamment à la confirmation de chaque UTXO. Les estimations calendaires sont approximatives et ne déterminent jamais la possibilité de dépenser.',
      es: 'Los bloqueos temporales relativos empiezan por separado cuando se confirma cada UTXO. Las estimaciones de calendario son aproximadas y nunca determinan si se puede gastar.'
    },
  'Remove this watch-only wallet from Groot on this device.': {
    fr: 'Supprimez de Groot ce portefeuille d’observation sur cet appareil.',
    es: 'Elimina de Groot esta cartera de solo lectura en este dispositivo.'
  },
  'Return to settings': { fr: 'Retour aux réglages', es: 'Volver a ajustes' },
  'Sanity checked': { fr: 'Cohérence vérifiée', es: 'Coherencia verificada' },
  'Save a public wallet backup, then prove it restores this exact wallet.': {
    fr: 'Enregistrez une sauvegarde publique du portefeuille, puis prouvez qu’elle restaure exactement ce portefeuille.',
    es: 'Guarda una copia pública de la cartera y demuestra que restaura exactamente esta cartera.'
  },
  'Save PDF': { fr: 'Enregistrer le PDF', es: 'Guardar PDF' },
  'Save the public policy, then verify it rebuilds the same first address.': {
    fr: 'Enregistrez la politique publique, puis vérifiez qu’elle reconstruit la même première adresse.',
    es: 'Guarda la política pública y verifica que reconstruye la misma primera dirección.'
  },
  Script: { fr: 'Script', es: 'Script' },
  'Second delay': { fr: 'Second délai', es: 'Segunda demora' },
  'Separate recovery key required': {
    fr: 'Clé de récupération distincte requise',
    es: 'Se requiere una clave de recuperación separada'
  },
  'Sign with any': {
    fr: 'Signer avec n’importe lesquelles des',
    es: 'Firmar con cualquiera de las'
  },
  signature: { fr: 'signature', es: 'firma' },
  'Signing keys': { fr: 'Clés de signature', es: 'Claves de firma' },
  'Simulate UTXO age:': { fr: 'Simuler l’âge de l’UTXO :', es: 'Simular antigüedad del UTXO:' },
  'Single-key policy': { fr: 'Politique à clé unique', es: 'Política de una sola clave' },
  Template: { fr: 'Modèle', es: 'Plantilla' },
  'Test recovery': { fr: 'Tester la récupération', es: 'Probar recuperación' },
  'The local wallet record, labels, and coordinator metadata will be removed. Recovery requires the descriptor backup you verified.':
    {
      fr: 'L’enregistrement local du portefeuille, les libellés et les métadonnées du coordinateur seront supprimés. La récupération nécessite la sauvegarde du descripteur que vous avez vérifiée.',
      es: 'Se eliminarán el registro local de la cartera, las etiquetas y los metadatos del coordinador. La recuperación requiere la copia del descriptor que verificaste.'
    },
  'The verified backup reconstructs': {
    fr: 'La sauvegarde vérifiée reconstruit',
    es: 'La copia verificada reconstruye'
  },
  'The wallet name does not match exactly.': {
    fr: 'Le nom du portefeuille ne correspond pas exactement.',
    es: 'El nombre de la cartera no coincide exactamente.'
  },
  'This public backup cannot sign transactions. Anyone who sees it can derive wallet addresses and observe wallet activity. Store it privately and separately from enough signing devices.':
    {
      fr: 'Cette sauvegarde publique ne peut pas signer de transactions. Toute personne qui la voit peut dériver les adresses du portefeuille et observer son activité. Conservez-la en privé et séparément d’un nombre suffisant d’appareils de signature.',
      es: 'Esta copia pública no puede firmar transacciones. Quien la vea puede derivar direcciones y observar la actividad de la cartera. Guárdala en privado y separada de suficientes dispositivos de firma.'
    },
  'This removes local coordinator data only. Hardware-wallet keys are unchanged.': {
    fr: 'Cela supprime uniquement les données locales du coordinateur. Les clés des portefeuilles matériels restent inchangées.',
    es: 'Esto solo elimina los datos locales del coordinador. Las claves de las carteras físicas no cambian.'
  },
  'This successful drill is available to the separate wallet-deletion flow for this app session.': {
    fr: 'Cet exercice réussi est disponible pour le flux distinct de suppression du portefeuille pendant cette session.',
    es: 'Este ensayo correcto queda disponible para el flujo separado de eliminación de la cartera durante esta sesión.'
  },
  'This wallet is controlled by one signing key. Add another wallet to use a shared or recovery policy.':
    {
      fr: 'Ce portefeuille est contrôlé par une seule clé de signature. Ajoutez un autre portefeuille pour utiliser une politique partagée ou de récupération.',
      es: 'Esta cartera está controlada por una sola clave de firma. Añade otra cartera para usar una política compartida o de recuperación.'
    },
  'Time-based locks are rejected in V2': {
    fr: 'Les verrouillages basés sur le temps sont refusés en V2',
    es: 'Los bloqueos basados en tiempo se rechazan en V2'
  },
  'Timelocked recovery': { fr: 'Récupération différée', es: 'Recuperación con bloqueo temporal' },
  'V2 POLICY LAB': { fr: 'LABORATOIRE DE POLITIQUE V2', es: 'LABORATORIO DE POLÍTICAS V2' },
  'Validate backup': { fr: 'Valider la sauvegarde', es: 'Validar copia de seguridad' },
  'Validate BSMS or public descriptor text, or restore complete Groot recovery metadata.': {
    fr: 'Validez un texte BSMS ou un descripteur public, ou restaurez toutes les métadonnées de récupération Groot.',
    es: 'Valida texto BSMS o un descriptor público, o restaura todos los metadatos de recuperación de Groot.'
  },
  'Verify on a wallet signer before sharing this address.': {
    fr: 'Vérifiez sur un signataire du portefeuille avant de communiquer cette adresse.',
    es: 'Verifica en un firmante de la cartera antes de compartir esta dirección.'
  },
  'Verify this first receive address against your offline record.': {
    fr: 'Comparez cette première adresse de réception à votre référence hors ligne.',
    es: 'Compara esta primera dirección de recepción con tu registro sin conexión.'
  },
  'View raw backup': { fr: 'Afficher la sauvegarde brute', es: 'Ver copia sin procesar' },
  'WALLET BACKUP': { fr: 'SAUVEGARDE DU PORTEFEUILLE', es: 'COPIA DE LA CARTERA' },
  'WALLET DELETION': { fr: 'SUPPRESSION DU PORTEFEUILLE', es: 'ELIMINACIÓN DE LA CARTERA' },
  'WALLET POLICY': { fr: 'POLITIQUE DU PORTEFEUILLE', es: 'POLÍTICA DE LA CARTERA' },
  'Watch-only descriptors — cannot spend bitcoin': {
    fr: 'Descripteurs d’observation — ne peuvent pas dépenser de bitcoin',
    es: 'Descriptores de solo lectura — no pueden gastar bitcoin'
  },
  wu: { fr: 'wu', es: 'wu' },
  '2 of 3 now; an emergency key after about one month.': {
    fr: '2 sur 3 maintenant ; une clé d’urgence après environ un mois.',
    es: '2 de 3 ahora; una clave de emergencia después de aproximadamente un mes.'
  },
  '2 of 3 now; an heir key after about one year.': {
    fr: '2 sur 3 maintenant ; une clé d’héritier après environ un an.',
    es: '2 de 3 ahora; una clave de heredero después de aproximadamente un año.'
  },
  '2 of 3 primary keys': { fr: '2 clés principales sur 3', es: '2 de 3 claves principales' },
  '2 of first 3 now · 1 recovery key after': {
    fr: '2 des 3 premières maintenant · 1 clé de récupération après',
    es: '2 de las primeras 3 ahora · 1 clave de recuperación después de'
  },
  'A fixed group approves every payment. No timer.': {
    fr: 'Un groupe fixe approuve chaque paiement. Aucun délai.',
    es: 'Un grupo fijo aprueba cada pago. Sin temporizador.'
  },
  Add: { fr: 'Ajouter', es: 'Añadir' },
  'Add key': { fr: 'Ajouter une clé', es: 'Añadir clave' },
  'Back to policy': { fr: 'Retour à la politique', es: 'Volver a la política' },
  'Back to signers': { fr: 'Retour aux signataires', es: 'Volver a los firmantes' },
  'Back to verification': { fr: 'Retour à la vérification', es: 'Volver a la verificación' },
  'BACK UP': { fr: 'SAUVEGARDE', es: 'COPIA DE SEGURIDAD' },
  'Back up the wallet descriptor.': {
    fr: 'Sauvegardez le descripteur du portefeuille.',
    es: 'Haz una copia del descriptor de la cartera.'
  },
  'Before you continue': { fr: 'Avant de continuer', es: 'Antes de continuar' },
  blocks: { fr: 'blocs', es: 'bloques' },
  'Change policy type': { fr: 'Changer le type de politique', es: 'Cambiar tipo de política' },
  'Choose a local name and confirm how many independent keys this policy needs.': {
    fr: 'Choisissez un nom local et confirmez le nombre de clés indépendantes requises par cette politique.',
    es: 'Elige un nombre local y confirma cuántas claves independientes necesita esta política.'
  },
  'Choose a spending policy': {
    fr: 'Choisissez une politique de dépense',
    es: 'Elige una política de gasto'
  },
  'Choose this only if you intentionally want the Trezor': {
    fr: 'Choisissez ceci uniquement si vous souhaitez intentionnellement le portefeuille Trezor',
    es: 'Elige esto solo si quieres intencionadamente la cartera Trezor'
  },
  'Coldcard XPUB JSON or Groot signer JSON · 256 KiB maximum': {
    fr: 'JSON XPUB Coldcard ou JSON de signataire Groot · 256 Kio maximum',
    es: 'JSON XPUB de Coldcard o JSON de firmante de Groot · máximo 256 KiB'
  },
  'Coldcard, BitBox02, Ledger, Trezor, Jade': {
    fr: 'Coldcard, BitBox02, Ledger, Trezor, Jade',
    es: 'Coldcard, BitBox02, Ledger, Trezor, Jade'
  },
  'Complete each section before creating this coordinator.': {
    fr: 'Terminez chaque section avant de créer ce coordinateur.',
    es: 'Completa cada sección antes de crear este coordinador.'
  },
  Configure: { fr: 'Configurer', es: 'Configurar' },
  'Confirm the policy and save the descriptor before creating this wallet.': {
    fr: 'Confirmez la politique et enregistrez le descripteur avant de créer ce portefeuille.',
    es: 'Confirma la política y guarda el descriptor antes de crear esta cartera.'
  },
  'Connect hardware device': { fr: 'Connecter un appareil matériel', es: 'Conectar dispositivo' },
  'Continue to backup': {
    fr: 'Continuer vers la sauvegarde',
    es: 'Continuar a la copia de seguridad'
  },
  'Continue to signers': { fr: 'Continuer vers les signataires', es: 'Continuar a los firmantes' },
  'Could not read the account key': {
    fr: 'Impossible de lire la clé du compte',
    es: 'No se pudo leer la clave de la cuenta'
  },
  'Create a multisig wallet': {
    fr: 'Créer un portefeuille multisignature',
    es: 'Crear una cartera multifirma'
  },
  'Create the watch-only coordinator now. Groot will block each unverified signer before transaction signing.':
    {
      fr: 'Créez maintenant le coordinateur d’observation. Groot bloquera chaque signataire non vérifié avant la signature d’une transaction.',
      es: 'Crea ahora el coordinador de solo lectura. Groot bloqueará a cada firmante sin verificar antes de firmar una transacción.'
    },
  'Create the watch-only coordinator now. Groot will stop an unregistered Coldcard before transaction signing.':
    {
      fr: 'Créez maintenant le coordinateur d’observation. Groot arrêtera toute Coldcard non enregistrée avant la signature d’une transaction.',
      es: 'Crea ahora el coordinador de solo lectura. Groot detendrá cualquier Coldcard no registrada antes de firmar una transacción.'
    },
  'Derivation:': { fr: 'Dérivation :', es: 'Derivación:' },
  'Descriptor logic': { fr: 'Logique du descripteur', es: 'Lógica del descriptor' },
  'Desktop · Bitcoin Core HWI': {
    fr: 'Ordinateur · HWI de Bitcoin Core',
    es: 'Escritorio · HWI de Bitcoin Core'
  },
  'Device fingerprint': { fr: 'Empreinte de l’appareil', es: 'Huella del dispositivo' },
  'Device help': { fr: 'Aide pour l’appareil', es: 'Ayuda del dispositivo' },
  'Edit keys': { fr: 'Modifier les clés', es: 'Editar claves' },
  'Enter public key': { fr: 'Saisir une clé publique', es: 'Introducir clave pública' },
  'FINAL REVIEW': { fr: 'VÉRIFICATION FINALE', es: 'REVISIÓN FINAL' },
  'Finish hardware setup before first signature': {
    fr: 'Terminer la configuration matérielle avant la première signature',
    es: 'Completar la configuración del dispositivo antes de la primera firma'
  },
  'Four independent keys required': {
    fr: 'Quatre clés indépendantes requises',
    es: 'Se requieren cuatro claves independientes'
  },
  'Groot starts at 2 signatures. A 1-of-N wallet has no multisig theft protection; use a single-key wallet instead.':
    {
      fr: 'Groot commence à 2 signatures. Un portefeuille 1 sur N n’offre aucune protection multisignature contre le vol ; utilisez plutôt un portefeuille à clé unique.',
      es: 'Groot comienza con 2 firmas. Una cartera 1 de N no ofrece protección multifirma contra robos; usa una cartera de una sola clave.'
    },
  'Groot stores public descriptors only. It cannot spend without enough signatures.': {
    fr: 'Groot stocke uniquement des descripteurs publics. Il ne peut pas dépenser sans un nombre suffisant de signatures.',
    es: 'Groot solo guarda descriptores públicos. No puede gastar sin suficientes firmas.'
  },
  'Hardware setup help': {
    fr: 'Aide à la configuration matérielle',
    es: 'Ayuda para configurar dispositivos'
  },
  'I matched the wallet name, threshold, and signer fingerprints on each device.': {
    fr: 'J’ai comparé le nom du portefeuille, le seuil et les empreintes des signataires sur chaque appareil.',
    es: 'He comparado el nombre de la cartera, el umbral y las huellas de los firmantes en cada dispositivo.'
  },
  'Import public-key file': {
    fr: 'Importer un fichier de clé publique',
    es: 'Importar archivo de clave pública'
  },
  'in this multisig policy. Enabling or choosing a passphrase later opens a different hidden wallet; it does not change this signer. The imported fingerprint is permanently bound to this policy.':
    {
      fr: 'dans cette politique multisignature. Activer ou choisir une phrase secrète plus tard ouvre un portefeuille masqué différent ; cela ne modifie pas ce signataire. L’empreinte importée est liée définitivement à cette politique.',
      es: 'en esta política multifirma. Activar o elegir una frase de contraseña más adelante abre una cartera oculta diferente; no cambia este firmante. La huella importada queda vinculada permanentemente a esta política.'
    },
  'independent keys': { fr: 'clés indépendantes', es: 'claves independientes' },
  'independent keys for this template.': {
    fr: 'clés indépendantes pour ce modèle.',
    es: 'claves independientes para esta plantilla.'
  },
  Inheritance: { fr: 'Héritage', es: 'Herencia' },
  'Initialize or restore only with trusted vendor tools.': {
    fr: 'Initialisez ou restaurez uniquement avec les outils fiables du fabricant.',
    es: 'Inicializa o restaura solo con herramientas de confianza del fabricante.'
  },
  'Its hardware wallet and seed are not changed.': {
    fr: 'Son portefeuille matériel et sa graine ne sont pas modifiés.',
    es: 'Su cartera física y su semilla no cambian.'
  },
  'Keep devices in separate places.': {
    fr: 'Conservez les appareils dans des lieux distincts.',
    es: 'Guarda los dispositivos en lugares separados.'
  },
  'Keep signer': { fr: 'Conserver le signataire', es: 'Conservar firmante' },
  'Keep USB free': { fr: 'Libérer l’USB', es: 'Mantener libre el USB' },
  key: { fr: 'clé', es: 'clave' },
  'Key 4 is delayed and excluded from the immediate 2-of-3 branch. It cannot be reused as a primary signer.':
    {
      fr: 'La clé 4 est différée et exclue de la branche immédiate 2 sur 3. Elle ne peut pas être réutilisée comme signataire principal.',
      es: 'La clave 4 está retrasada y excluida de la rama inmediata 2 de 3. No se puede reutilizar como firmante principal.'
    },
  'Larger group': { fr: 'Groupe plus grand', es: 'Grupo más grande' },
  'MULTISIG WALLET': { fr: 'PORTEFEUILLE MULTISIGNATURE', es: 'CARTERA MULTIFIRMA' },
  'Never enter a seed into Groot.': {
    fr: 'Ne saisissez jamais de graine dans Groot.',
    es: 'Nunca introduzcas una semilla en Groot.'
  },
  'No hardware passphrase for this signer': {
    fr: 'Aucune phrase secrète matérielle pour ce signataire',
    es: 'Sin frase de contraseña del dispositivo para este firmante'
  },
  'No signers yet': { fr: 'Aucun signataire pour le moment', es: 'Aún no hay firmantes' },
  NOW: { fr: 'MAINTENANT', es: 'AHORA' },
  'On every Coldcard, import it from': {
    fr: 'Sur chaque Coldcard, importez-la depuis',
    es: 'En cada Coldcard, impórtala desde'
  },
  'Paste an account xpub and fingerprint': {
    fr: 'Coller une xpub de compte et une empreinte',
    es: 'Pegar una xpub de cuenta y una huella'
  },
  'PINs do not match.': { fr: 'Les codes PIN ne correspondent pas.', es: 'Los PIN no coinciden.' },
  'POLICY · 1 OF 2': { fr: 'POLITIQUE · 1 SUR 2', es: 'POLÍTICA · 1 DE 2' },
  'POLICY · 2 OF 2': { fr: 'POLITIQUE · 2 SUR 2', es: 'POLÍTICA · 2 DE 2' },
  'Policy role': { fr: 'Rôle dans la politique', es: 'Función en la política' },
  'Policy verified on every Coldcard': {
    fr: 'Politique vérifiée sur chaque Coldcard',
    es: 'Política verificada en cada Coldcard'
  },
  Protect: { fr: 'Protéger', es: 'Proteger' },
  Recover: { fr: 'Récupérer', es: 'Recuperar' },
  'Recovery path': { fr: 'Chemin de récupération', es: 'Ruta de recuperación' },
  'Recovery path and Inheritance use the same four-key structure. Their intended holder and delay are different; the delayed key cannot spend before its timer matures.':
    {
      fr: 'Le chemin de récupération et l’héritage utilisent la même structure à quatre clés. Leur détenteur prévu et leur délai diffèrent ; la clé différée ne peut pas dépenser avant l’échéance du délai.',
      es: 'La ruta de recuperación y la herencia usan la misma estructura de cuatro claves. Su titular previsto y su demora son diferentes; la clave retrasada no puede gastar antes de que venza el plazo.'
    },
  'Refresh connected signers.': {
    fr: 'Actualisez les signataires connectés.',
    es: 'Actualiza los firmantes conectados.'
  },
  'Regtest · Native SegWit': { fr: 'Regtest · SegWit natif', es: 'Regtest · SegWit nativo' },
  'Remove signer': { fr: 'Supprimer le signataire', es: 'Eliminar firmante' },
  'Review wallet': { fr: 'Vérifier le portefeuille', es: 'Revisar cartera' },
  'Save the policy to microSD or Coldcard Virtual Disk.': {
    fr: 'Enregistrez la politique sur microSD ou sur le disque virtuel Coldcard.',
    es: 'Guarda la política en microSD o en el disco virtual de Coldcard.'
  },
  'Saved signer not found': {
    fr: 'Signataire enregistré introuvable',
    es: 'No se encontró el firmante guardado'
  },
  'Scan for devices': { fr: 'Rechercher des appareils', es: 'Buscar dispositivos' },
  'Settings → Multisig Wallets → Import': {
    fr: 'Réglages → Portefeuilles multisignatures → Importer',
    es: 'Ajustes → Carteras multifirma → Importar'
  },
  'Setup progress could not be saved': {
    fr: 'La progression de la configuration n’a pas pu être enregistrée',
    es: 'No se pudo guardar el progreso de la configuración'
  },
  signatures: { fr: 'signatures', es: 'firmas' },
  'Signatures required (M)': { fr: 'Signatures requises (M)', es: 'Firmas requeridas (M)' },
  'Signer label': { fr: 'Libellé du signataire', es: 'Etiqueta del firmante' },
  SIGNERS: { fr: 'SIGNATAIRES', es: 'FIRMANTES' },
  'signers added': { fr: 'signataires ajoutés', es: 'firmantes añadidos' },
  'Spend paths': { fr: 'Chemins de dépense', es: 'Rutas de gasto' },
  Standard: { fr: 'Standard', es: 'Estándar' },
  'standard wallet': { fr: 'portefeuille standard', es: 'cartera estándar' },
  'Start with who should be able to spend and whether a separate delayed key is needed.': {
    fr: 'Commencez par déterminer qui doit pouvoir dépenser et si une clé différée distincte est nécessaire.',
    es: 'Empieza por decidir quién debe poder gastar y si se necesita una clave retrasada separada.'
  },
  'This imports the key derived from the device seed alone. It does not disable, change, or reveal any hidden passphrase wallet you may use elsewhere.':
    {
      fr: 'Cela importe uniquement la clé dérivée de la graine de l’appareil. Cela ne désactive, ne modifie ni ne révèle aucun portefeuille masqué par phrase secrète que vous pourriez utiliser ailleurs.',
      es: 'Esto importa únicamente la clave derivada de la semilla del dispositivo. No desactiva, cambia ni revela ninguna cartera oculta con frase de contraseña que puedas usar en otro lugar.'
    },
  'Total signers (N)': { fr: 'Nombre total de signataires (N)', es: 'Firmantes totales (N)' },
  'Unlock the signer and quit other wallet apps before scanning.': {
    fr: 'Déverrouillez le signataire et quittez les autres applications de portefeuille avant la recherche.',
    es: 'Desbloquea el firmante y cierra otras aplicaciones de cartera antes de buscar.'
  },
  'Verify each fingerprint on its device.': {
    fr: 'Vérifiez chaque empreinte sur son appareil.',
    es: 'Verifica cada huella en su dispositivo.'
  },
  'Verify the wallet name, 2-of-3 threshold, and all signer fingerprints on-device.': {
    fr: 'Vérifiez sur l’appareil le nom du portefeuille, le seuil 2 sur 3 et toutes les empreintes des signataires.',
    es: 'Verifica en el dispositivo el nombre de la cartera, el umbral 2 de 3 y todas las huellas de los firmantes.'
  },
  'You will need to add this signer again.': {
    fr: 'Vous devrez ajouter à nouveau ce signataire.',
    es: 'Tendrás que volver a añadir este firmante.'
  }
} as const satisfies CatalogSection;

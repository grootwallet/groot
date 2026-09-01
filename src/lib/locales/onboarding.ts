import type { CatalogSection } from './types';

export const onboardingCopy = {
  'Network setup was not copied. Configure it in Settings.': {
    fr: 'La configuration réseau n’a pas été copiée. Configurez-la dans les réglages.',
    es: 'La configuración de red no se copió. Configúrala en Ajustes.'
  },
  'Only public descriptors are stored in Groot.': {
    fr: 'Seuls les descripteurs publics sont enregistrés dans Groot.',
    es: 'En Groot solo se guardan descriptores públicos.'
  },
  'Sync to restore transaction history.': {
    fr: 'Synchronisez pour restaurer l’historique des transactions.',
    es: 'Sincroniza para restaurar el historial de transacciones.'
  },
  'Your regtest wallet is ready.': {
    fr: 'Votre portefeuille regtest est prêt.',
    es: 'Tu cartera regtest está lista.'
  },
  'Your wallet is ready. Verify its recovery backup soon.': {
    fr: 'Votre portefeuille est prêt. Vérifiez bientôt sa sauvegarde de récupération.',
    es: 'Tu cartera está lista. Verifica pronto su copia de recuperación.'
  },
  'Enter this wallet’s passphrase to continue.': {
    fr: 'Saisissez la phrase secrète de ce portefeuille pour continuer.',
    es: 'Introduce la frase de contraseña de esta cartera para continuar.'
  },
  'This BIP39 passphrase is required with your 24 recovery words and also unlocks Groot. A different passphrase opens a different wallet.':
    {
      fr: 'Cette phrase secrète BIP39 est requise avec vos 24 mots de récupération et déverrouille également Groot. Une phrase secrète différente ouvre un portefeuille différent.',
      es: 'Esta frase de contraseña BIP39 es necesaria junto con tus 24 palabras de recuperación y también desbloquea Groot. Una frase diferente abre una cartera diferente.'
    },
  'This app PIN protects local Groot data only. It is not a hardware-signer passphrase and is not part of a signer seed backup.':
    {
      fr: 'Ce code PIN protège uniquement les données locales de Groot. Ce n’est pas une phrase secrète de signataire matériel et il ne fait pas partie de la sauvegarde de la graine d’un signataire.',
      es: 'Este PIN solo protege los datos locales de Groot. No es una frase de contraseña del firmante físico ni forma parte de la copia de la semilla de un firmante.'
    },
  'Groot will not guess missing metadata or reset its app PIN. Because Regtest wallets are disposable, delete this test wallet and recreate or recover it from a public wallet backup. Its existing files remain untouched until you explicitly delete it.':
    {
      fr: 'Groot ne devinera pas les métadonnées manquantes et ne réinitialisera pas son code PIN. Les portefeuilles Regtest étant jetables, supprimez ce portefeuille de test puis recréez-le ou récupérez-le depuis une sauvegarde publique. Ses fichiers existants restent intacts jusqu’à leur suppression explicite.',
      es: 'Groot no intentará adivinar metadatos ausentes ni restablecerá su PIN. Como las carteras de Regtest son desechables, elimina esta cartera de prueba y vuelve a crearla o recupérala desde una copia pública. Sus archivos existentes permanecen intactos hasta que los elimines explícitamente.'
    },
  'It cannot be undone unless you have the correct 24 recovery words and wallet passphrase.': {
    fr: 'Cette action est irréversible sauf si vous possédez les 24 mots de récupération et la phrase secrète corrects.',
    es: 'No se puede deshacer a menos que tengas las 24 palabras de recuperación y la frase de contraseña correctas.'
  },
  'It cannot be undone unless you have the public wallet backup and access to the required signer or signers.':
    {
      fr: 'Cette action est irréversible sauf si vous possédez la sauvegarde publique du portefeuille et l’accès aux signataires requis.',
      es: 'No se puede deshacer a menos que tengas la copia pública de la cartera y acceso a los firmantes necesarios.'
    },
  'This disposable Regtest wallet uses an unsupported test-profile format.': {
    fr: 'Ce portefeuille Regtest jetable utilise un format de profil de test non pris en charge.',
    es: 'Esta cartera desechable de Regtest usa un formato de perfil de prueba no compatible.'
  },
  'This profile predates the current hardware-signer storage format.': {
    fr: 'Ce profil est antérieur au format actuel de stockage des signataires matériels.',
    es: 'Este perfil es anterior al formato actual de almacenamiento de firmantes físicos.'
  },
  'Choose every word in order. This proves your written backup can reconstruct the wallet.': {
    fr: 'Choisissez chaque mot dans l’ordre. Cela prouve que votre sauvegarde écrite peut reconstruire le portefeuille.',
    es: 'Elige cada palabra en orden. Esto demuestra que tu copia escrita puede reconstruir la cartera.'
  },
  'Choose the BIP39 wallet passphrase that completes this backup. The same passphrase unlocks Groot.':
    {
      fr: 'Choisissez la phrase secrète BIP39 qui complète cette sauvegarde. La même phrase secrète déverrouille Groot.',
      es: 'Elige la frase de contraseña BIP39 que completa esta copia. La misma frase desbloquea Groot.'
    },
  'Use at least 16 characters. Letters-only passphrases are allowed. Keep it with your recovery words; it also unlocks Groot on this device.':
    {
      fr: 'Utilisez au moins 16 caractères. Une phrase composée uniquement de lettres est acceptée. Conservez-la avec vos mots de récupération ; elle déverrouille aussi Groot sur cet appareil.',
      es: 'Usa al menos 16 caracteres. Se permiten frases formadas solo por letras. Guárdala con tus palabras de recuperación; también desbloquea Groot en este dispositivo.'
    },
  'Use at least 16 characters. Letters-only passphrases are allowed.': {
    fr: 'Utilisez au moins 16 caractères. Une phrase composée uniquement de lettres est acceptée.',
    es: 'Usa al menos 16 caracteres. Se permiten frases formadas solo por letras.'
  },
  'Copies its node and sync method. This wallet protects its own copy.': {
    fr: 'Copie son nœud et sa méthode de synchronisation. Ce portefeuille protège sa propre copie.',
    es: 'Copia su nodo y método de sincronización. Esta cartera protege su propia copia.'
  },
  'Create in Groot, connect existing hardware, or recover a software wallet.': {
    fr: 'Créez dans Groot, connectez un appareil existant ou récupérez un portefeuille logiciel.',
    es: 'Crea en Groot, conecta un dispositivo existente o recupera una cartera de software.'
  },
  'Groot will generate 24 recovery words securely on this device. Write them down in order and keep them offline.':
    {
      fr: 'Groot générera 24 mots de récupération de manière sécurisée sur cet appareil. Notez-les dans l’ordre et conservez-les hors ligne.',
      es: 'Groot generará 24 palabras de recuperación de forma segura en este dispositivo. Anótalas en orden y mantenlas sin conexión.'
    },
  'I understand this exact passphrase is required with my 24 words. It cannot be reset; a different passphrase opens a different wallet.':
    {
      fr: 'Je comprends que cette phrase secrète exacte est requise avec mes 24 mots. Elle ne peut pas être réinitialisée ; une autre phrase secrète ouvre un autre portefeuille.',
      es: 'Entiendo que esta frase de contraseña exacta es necesaria junto con mis 24 palabras. No se puede restablecer; otra frase abre una cartera diferente.'
    },
  'Only reveal your recovery words in a private place. Make sure no person, camera, or screen sharing can see them.':
    {
      fr: 'N’affichez vos mots de récupération que dans un lieu privé. Assurez-vous qu’aucune personne, caméra ou diffusion d’écran ne puisse les voir.',
      es: 'Muestra tus palabras de recuperación solo en un lugar privado. Asegúrate de que ninguna persona, cámara o pantalla compartida pueda verlas.'
    },
  'Optional. Groot always requires 256-bit operating-system randomness. Physical results are mixed in only as an additional input.':
    {
      fr: 'Facultatif. Groot exige toujours 256 bits d’aléa fourni par le système d’exploitation. Les résultats physiques ne sont ajoutés que comme entrée supplémentaire.',
      es: 'Opcional. Groot siempre requiere 256 bits de aleatoriedad del sistema operativo. Los resultados físicos solo se mezclan como entrada adicional.'
    },
  'Tap a placed word to return it. You can also drag words between the pool and sequence.': {
    fr: 'Touchez un mot placé pour le remettre dans la liste. Vous pouvez aussi faire glisser les mots entre la liste et la séquence.',
    es: 'Pulsa una palabra colocada para devolverla. También puedes arrastrar palabras entre el grupo y la secuencia.'
  },
  'This cannot protect a wallet created on a compromised device, and the operating-system source never becomes optional.':
    {
      fr: 'Cela ne peut pas protéger un portefeuille créé sur un appareil compromis, et la source du système d’exploitation reste toujours obligatoire.',
      es: 'Esto no puede proteger una cartera creada en un dispositivo comprometido, y la fuente del sistema operativo nunca deja de ser obligatoria.'
    },
  'Write these down in order. Never store them in a screenshot or password manager.': {
    fr: 'Notez-les dans l’ordre. Ne les conservez jamais dans une capture d’écran ni un gestionnaire de mots de passe.',
    es: 'Anótalas en orden. Nunca las guardes en una captura de pantalla ni en un gestor de contraseñas.'
  },
  'You can use the wallet now, but Groot will keep reminding you to verify the written words.': {
    fr: 'Vous pouvez utiliser le portefeuille maintenant, mais Groot continuera à vous rappeler de vérifier les mots écrits.',
    es: 'Ya puedes usar la cartera, pero Groot seguirá recordándote que verifiques las palabras escritas.'
  },
  'Your 24 recovery words are entered in a native system window so they never enter Groot’s web interface.':
    {
      fr: 'Vos 24 mots de récupération sont saisis dans une fenêtre native du système afin de ne jamais entrer dans l’interface web de Groot.',
      es: 'Tus 24 palabras de recuperación se introducen en una ventana nativa del sistema para que nunca entren en la interfaz web de Groot.'
    },
  '’s network setup.': { fr: ' : configuration réseau.', es: ': configuración de red.' },
  Advanced: { fr: 'Avancé', es: 'Avanzado' },
  'Advanced: add physical randomness': {
    fr: 'Avancé : ajouter du hasard physique',
    es: 'Avanzado: añadir aleatoriedad física'
  },
  'Anyone with them can spend your funds.': {
    fr: 'Toute personne qui les possède peut dépenser vos fonds.',
    es: 'Cualquiera que las tenga puede gastar tus fondos.'
  },
  'Backup not verified yet': {
    fr: 'Sauvegarde pas encore vérifiée',
    es: 'Copia de seguridad aún sin verificar'
  },
  'Check your surroundings': { fr: 'Vérifiez votre environnement', es: 'Comprueba tu entorno' },
  'Choose your wallet': {
    fr: 'Choisissez votre portefeuille',
    es: 'Elige tu cartera'
  },
  Clear: { fr: 'Effacer', es: 'Borrar' },
  'Coin flips': { fr: 'Lancers de pièce', es: 'Lanzamientos de moneda' },
  'Confirm order': { fr: 'Confirmer l’ordre', es: 'Confirmar orden' },
  'Confirm your backup': { fr: 'Confirmez votre sauvegarde', es: 'Confirma tu copia de seguridad' },
  'Create wallet': { fr: 'Créer le portefeuille', es: 'Crear cartera' },
  'Create and back up your keys in Groot.': {
    fr: 'Créez et sauvegardez vos clés dans Groot.',
    es: 'Crea y respalda tus claves en Groot.'
  },
  Empty: { fr: 'Vide', es: 'Vacío' },
  'Enter recovery words securely': {
    fr: 'Saisir les mots de récupération en toute sécurité',
    es: 'Introducir las palabras de recuperación de forma segura'
  },
  'Flexible security': { fr: 'Sécurité flexible', es: 'Seguridad flexible' },
  'Generate 24 recovery words': {
    fr: 'Générer 24 mots de récupération',
    es: 'Generar 24 palabras de recuperación'
  },
  'Generate wallet': { fr: 'Générer le portefeuille', es: 'Generar cartera' },
  Heads: { fr: 'Face', es: 'Cara' },
  'Hide words': { fr: 'Masquer les mots', es: 'Ocultar palabras' },
  'I wrote them down': { fr: 'Je les ai notés', es: 'Las he anotado' },
  'I’m private — reveal words': {
    fr: 'Je suis à l’abri des regards — afficher les mots',
    es: 'Estoy en privado — mostrar palabras'
  },
  'Hardware signer': { fr: 'Signataire matériel', es: 'Firmante físico' },
  'Keep it with your backup.': {
    fr: 'Conservez-le avec votre sauvegarde.',
    es: 'Guárdalo con tu copia de seguridad.'
  },
  'Keys stay on this device · Open source': {
    fr: 'Les clés restent sur cet appareil · Code source ouvert',
    es: 'Las claves permanecen en este dispositivo · Código abierto'
  },
  minimum: { fr: 'minimum', es: 'mínimo' },
  'No account, email, or cloud backup.': {
    fr: 'Aucun compte, e-mail ni sauvegarde dans le cloud.',
    es: 'Sin cuenta, correo electrónico ni copia en la nube.'
  },
  'Non-custodial · Onchain only': {
    fr: 'Non dépositaire · Uniquement onchain',
    es: 'Sin custodia · Solo onchain'
  },
  None: { fr: 'Aucun', es: 'Ninguno' },
  'On this device': { fr: 'Sur cet appareil', es: 'En este dispositivo' },
  'Protect your wallet': { fr: 'Protégez votre portefeuille', es: 'Protege tu cartera' },
  Recommended: { fr: 'Recommandé', es: 'Recomendado' },
  'Recover software wallet': {
    fr: 'Récupérer un portefeuille logiciel',
    es: 'Recuperar cartera de software'
  },
  'Recover wallet': { fr: 'Récupérer le portefeuille', es: 'Recuperar cartera' },
  RECOVERY: { fr: 'RÉCUPÉRATION', es: 'RECUPERACIÓN' },
  'Recovery words': { fr: 'Mots de récupération', es: 'Palabras de recuperación' },
  'Recovery words are the backup': {
    fr: 'Les mots de récupération constituent la sauvegarde',
    es: 'Las palabras de recuperación son la copia de seguridad'
  },
  'Separate device': { fr: 'Appareil séparé', es: 'Dispositivo separado' },
  'Software wallet': { fr: 'Portefeuille logiciel', es: 'Cartera de software' },
  'Start with what feels right. You can always add another.': {
    fr: 'Commencez avec la solution qui vous convient. Vous pourrez toujours en ajouter une autre.',
    es: 'Empieza con la opción que mejor te encaje. Siempre podrás añadir otra.'
  },
  'Showing the latest 32': { fr: 'Affichage des 32 derniers', es: 'Mostrando los últimos 32' },
  'Six-sided die': { fr: 'Dé à six faces', es: 'Dado de seis caras' },
  Tails: { fr: 'Pile', es: 'Cruz' },
  'Undo last': { fr: 'Annuler le dernier', es: 'Deshacer último' },
  Use: { fr: 'Utiliser', es: 'Usar' },
  'Connect a device you already trust.': {
    fr: 'Connectez un appareil auquel vous faites déjà confiance.',
    es: 'Conecta un dispositivo en el que ya confías.'
  },
  'Multisig wallet': { fr: 'Portefeuille multisig', es: 'Cartera multifirma' },
  'Custom spending, recovery, inheritance, or shared control.': {
    fr: 'Dépenses sur mesure, récupération, héritage ou contrôle partagé.',
    es: 'Gasto personalizado, recuperación, herencia o control compartido.'
  },
  'Use real physical results.': {
    fr: 'Utilisez de vrais résultats physiques.',
    es: 'Usa resultados físicos reales.'
  },
  'Verify later': { fr: 'Vérifier plus tard', es: 'Verificar más tarde' },
  'WALLET SETUP': { fr: 'CONFIGURATION DU PORTEFEUILLE', es: 'CONFIGURACIÓN DE LA CARTERA' },
  'You control the keys': { fr: 'Vous contrôlez les clés', es: 'Tú controlas las claves' },
  'Delete test wallet': {
    fr: 'Supprimer le portefeuille de test',
    es: 'Eliminar cartera de prueba'
  },
  'Delete this regtest wallet': {
    fr: 'Supprimer ce portefeuille Regtest',
    es: 'Eliminar esta cartera de Regtest'
  },
  'Enter this wallet’s app PIN to continue.': {
    fr: 'Saisissez le code PIN de ce portefeuille pour continuer.',
    es: 'Introduce el PIN de esta cartera para continuar.'
  },
  'prototype-passphrase': { fr: 'prototype-passphrase', es: 'prototype-passphrase' },
  'This removes the encrypted wallet data from this device.': {
    fr: 'Cette action supprime de cet appareil les données chiffrées du portefeuille.',
    es: 'Esto elimina de este dispositivo los datos cifrados de la cartera.'
  },
  'Type RESET REGTEST to confirm': {
    fr: 'Saisissez RESET REGTEST pour confirmer',
    es: 'Escribe RESET REGTEST para confirmar'
  },
  'UI prototype PIN:': {
    fr: 'PIN du prototype d’interface :',
    es: 'PIN del prototipo de interfaz:'
  },
  'Unlock wallet': { fr: 'Déverrouiller le portefeuille', es: 'Desbloquear cartera' },
  'WALLET LOCKED': { fr: 'PORTEFEUILLE VERROUILLÉ', es: 'CARTERA BLOQUEADA' }
} as const satisfies CatalogSection;

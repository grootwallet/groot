import type { CatalogSection } from './types';

export const hardwareCopy = {
  bitbox: { fr: 'bitbox', es: 'bitbox' },
  'Scanning all USB hardware signers…': {
    fr: 'Recherche de tous les signataires matériels USB…',
    es: 'Buscando todos los firmantes físicos USB…'
  },
  scan: { fr: 'analyser', es: 'buscar' },
  unlock: { fr: 'déverrouiller', es: 'desbloquear' },
  'Unlock & continue': { fr: 'Déverrouiller et continuer', es: 'Desbloquear y continuar' },
  'Try this signer again': {
    fr: 'Réessayer avec ce signataire',
    es: 'Volver a intentar con este firmante'
  },
  'Unlock and check your hardware device': {
    fr: 'Déverrouillez et vérifiez votre appareil matériel',
    es: 'Desbloquea y comprueba tu dispositivo físico'
  },
  'Complete the login or unlock on-device, then compare the complete address above and approve it.':
    {
      fr: 'Terminez la connexion ou le déverrouillage sur l’appareil, puis comparez l’adresse complète ci-dessus et approuvez-la.',
      es: 'Completa el inicio de sesión o desbloqueo en el dispositivo, compara la dirección completa de arriba y apruébala.'
    },
  'Waiting for hardware unlock and approval': {
    fr: 'En attente du déverrouillage et de l’approbation sur l’appareil',
    es: 'Esperando el desbloqueo y la aprobación del dispositivo'
  },
  'Select this signer, then unlock it on BitBox to continue.': {
    fr: 'Sélectionnez ce signataire, puis déverrouillez-le sur BitBox pour continuer.',
    es: 'Selecciona este firmante y desbloquéalo en BitBox para continuar.'
  },
  'Detected. Continue to read and verify the public account key. BitBox may request its password again for the new secure connection.':
    {
      fr: 'Détecté. Continuez pour lire et vérifier la clé publique du compte. BitBox peut redemander son mot de passe pour la nouvelle connexion sécurisée.',
      es: 'Detectado. Continúa para leer y verificar la clave pública de la cuenta. BitBox puede volver a solicitar su contraseña para la nueva conexión segura.'
    },
  'BitBox may request its password again for this new secure connection. Enter it only on BitBox.':
    {
      fr: 'BitBox peut redemander son mot de passe pour cette nouvelle connexion sécurisée. Saisissez-le uniquement sur BitBox.',
      es: 'BitBox puede volver a solicitar su contraseña para esta nueva conexión segura. Introdúcela únicamente en BitBox.'
    },
  'BitBox may request its password again for this new secure connection. Check its screen, enter the password on BitBox if asked, and try again.':
    {
      fr: 'BitBox peut redemander son mot de passe pour cette nouvelle connexion sécurisée. Vérifiez son écran, saisissez le mot de passe sur BitBox si demandé, puis réessayez.',
      es: 'BitBox puede volver a solicitar su contraseña para esta nueva conexión segura. Comprueba su pantalla, introduce la contraseña en BitBox si se solicita y vuelve a intentarlo.'
    },
  "This Groot release's bundled HWI 3.2.0 does not support this Trezor model. Update Groot when a reviewed release adds support, then scan again.":
    {
      fr: 'La version HWI 3.2.0 intégrée à cette version de Groot ne prend pas en charge ce modèle Trezor. Mettez Groot à jour lorsqu’une version vérifiée ajoutera sa prise en charge, puis relancez la recherche.',
      es: 'La versión HWI 3.2.0 incluida en esta versión de Groot no admite este modelo de Trezor. Actualiza Groot cuando una versión revisada añada compatibilidad y vuelve a buscar.'
    },
  'This hardware signer is not supported by Groot.': {
    fr: 'Ce signataire matériel n’est pas pris en charge par Groot.',
    es: 'Groot no admite este firmante físico.'
  },
  'Locked. Start the PIN matrix, then tap the blank cells matching the locations shown on the device.':
    {
      fr: 'Verrouillé. Démarrez la matrice du PIN, puis touchez les cases vides correspondant aux positions affichées sur l’appareil.',
      es: 'Bloqueado. Inicia la matriz del PIN y toca las casillas vacías que correspondan a las posiciones mostradas en el dispositivo.'
    },
  'Passphrase protection is enabled. Choose the standard wallet with no passphrase, or select a hidden wallet on-device when supported.':
    {
      fr: 'La protection par phrase secrète est activée. Choisissez le portefeuille standard sans phrase secrète, ou sélectionnez un portefeuille masqué sur l’appareil lorsque cela est pris en charge.',
      es: 'La protección con frase de contraseña está activada. Elige la cartera estándar sin frase de contraseña o selecciona una cartera oculta en el dispositivo cuando sea compatible.'
    },
  'Detected. Groot verifies that Bitcoin Test is open when it reads the public account key.': {
    fr: 'Détecté. Groot vérifie que Bitcoin Test est ouvert lors de la lecture de la clé publique du compte.',
    es: 'Detectado. Groot verifica que Bitcoin Test esté abierto al leer la clave pública de la cuenta.'
  },
  'Ready to import the public account key.': {
    fr: 'Prêt à importer la clé publique du compte.',
    es: 'Listo para importar la clave pública de la cuenta.'
  },
  'Unlock Coldcard and enable USB communication, then scan again.': {
    fr: 'Déverrouillez Coldcard et activez la communication USB, puis relancez la recherche.',
    es: 'Desbloquea Coldcard, activa la comunicación USB y vuelve a buscar.'
  },
  'Detected, but not ready. Finish setup and unlock the device, then scan again.': {
    fr: 'Détecté, mais pas prêt. Terminez la configuration et déverrouillez l’appareil, puis relancez la recherche.',
    es: 'Detectado, pero no está listo. Termina la configuración, desbloquea el dispositivo y vuelve a buscar.'
  },
  'Select this signer. Groot will ask Jade to unlock; enter your PIN on Jade when prompted.': {
    fr: 'Sélectionnez ce signataire. Groot demandera à Jade de se déverrouiller ; saisissez votre PIN sur Jade lorsqu’il vous le demande.',
    es: 'Selecciona este firmante. Groot pedirá a Jade que se desbloquee; introduce tu PIN en Jade cuando te lo pida.'
  },
  'Jade is still locked. Select it again and enter your PIN on Jade when prompted.': {
    fr: 'Jade est toujours verrouillé. Sélectionnez-le à nouveau et saisissez votre PIN sur Jade lorsqu’il vous le demande.',
    es: 'Jade sigue bloqueado. Selecciónalo de nuevo e introduce tu PIN en Jade cuando te lo pida.'
  },
  'Jade did not unlock. Try again and enter your PIN on Jade when prompted.': {
    fr: 'Jade ne s’est pas déverrouillé. Réessayez et saisissez votre PIN sur Jade lorsqu’il vous le demande.',
    es: 'Jade no se desbloqueó. Inténtalo de nuevo e introduce tu PIN en Jade cuando te lo pida.'
  },
  'More than one locked wallet of an eligible type is connected. Disconnect the extra device, then scan again.':
    {
      fr: 'Plusieurs portefeuilles verrouillés du même type sont connectés. Déconnectez l’appareil supplémentaire, puis relancez l’analyse.',
      es: 'Hay varias carteras bloqueadas del mismo tipo conectadas. Desconecta el dispositivo adicional y vuelve a buscar.'
    },
  'The selected address changed. Start verification again.': {
    fr: 'L’adresse sélectionnée a changé. Recommencez la vérification.',
    es: 'La dirección seleccionada ha cambiado. Vuelve a iniciar la verificación.'
  },
  'The device could not verify this address.': {
    fr: 'L’appareil n’a pas pu vérifier cette adresse.',
    es: 'El dispositivo no pudo verificar esta dirección.'
  },
  'Could not scan hardware.': {
    fr: 'Impossible de rechercher les appareils matériels.',
    es: 'No se pudieron buscar dispositivos físicos.'
  },
  'Could not scan hardware': {
    fr: 'Impossible de rechercher les appareils matériels',
    es: 'No se pudieron buscar dispositivos físicos'
  },
  'Could not start hardware unlock': {
    fr: 'Impossible de démarrer le déverrouillage matériel',
    es: 'No se pudo iniciar el desbloqueo del dispositivo'
  },
  'Could not start the PIN matrix.': {
    fr: 'Impossible de démarrer la matrice du PIN.',
    es: 'No se pudo iniciar la matriz del PIN.'
  },
  'Trezor did not accept that matrix entry.': {
    fr: 'Trezor n’a pas accepté cette saisie dans la matrice.',
    es: 'Trezor no aceptó esa entrada de la matriz.'
  },
  'Select this signer, unlock Ledger, and open Bitcoin Test—not Bitcoin—to continue.': {
    fr: 'Sélectionnez ce signataire, déverrouillez Ledger et ouvrez Bitcoin Test — pas Bitcoin — pour continuer.',
    es: 'Selecciona este firmante, desbloquea Ledger y abre Bitcoin Test —no Bitcoin— para continuar.'
  },
  usb: { fr: 'USB', es: 'USB' },
  qr: { fr: 'QR', es: 'QR' },
  file: { fr: 'fichier', es: 'archivo' },
  manual: { fr: 'manuel', es: 'manual' },
  virtual: { fr: 'virtuel', es: 'virtual' },
  'Reading the public account key from {device}…': {
    fr: 'Lecture de la clé de compte publique depuis {device}…',
    es: 'Leyendo la clave pública de cuenta de {device}…'
  },
  'Reading the public key from {device}…': {
    fr: 'Lecture de la clé publique depuis {device}…',
    es: 'Leyendo la clave pública de {device}…'
  },
  "{device} is not supported by Groot's pinned HWI release and has not completed physical certification.":
    {
      fr: '{device} n’est pas pris en charge par la version HWI épinglée de Groot et n’a pas terminé la certification physique.',
      es: '{device} no es compatible con la versión HWI fijada de Groot y no ha completado la certificación física.'
    },
  'USB hardware': { fr: 'Matériel USB', es: 'Dispositivo USB' },
  'QR import': { fr: 'Importation QR', es: 'Importación QR' },
  'File import': { fr: 'Importation de fichier', es: 'Importación de archivo' },
  'Manual backup': { fr: 'Sauvegarde manuelle', es: 'Copia manual' },
  'Virtual test device': { fr: 'Appareil de test virtuel', es: 'Dispositivo de prueba virtual' },
  Detected: { fr: 'Détecté', es: 'Detectado' },
  'Choose wallet': { fr: 'Choisir le portefeuille', es: 'Elegir cartera' },
  'Hardware signer': { fr: 'Signataire matériel', es: 'Firmante físico' },
  'Single-key': { fr: 'Clé unique', es: 'Clave única' },
  'USB demo': { fr: 'Démo USB', es: 'Demostración USB' },
  'Manual entry': { fr: 'Saisie manuelle', es: 'Entrada manual' },
  'Imported via': { fr: 'Importé via', es: 'Importado mediante' },
  Connection: { fr: 'Connexion', es: 'Conexión' },
  'Fingerprint {fingerprint} · {message}': {
    fr: 'Empreinte {fingerprint} · {message}',
    es: 'Huella {fingerprint} · {message}'
  },
  'Not recorded': { fr: 'Non enregistrée', es: 'No registrada' },
  'A different seed or passphrase produces a different fingerprint and completely different addresses. Nano S Plus does not display this fingerprint, so verify your first receive address on Ledger before using the wallet.':
    {
      fr: 'Une graine ou une phrase secrète différente produit une empreinte et des adresses totalement différentes. Le Nano S Plus n’affiche pas cette empreinte ; vérifiez donc votre première adresse de réception sur Ledger avant d’utiliser le portefeuille.',
      es: 'Una semilla o frase de contraseña diferente produce una huella y direcciones completamente distintas. Nano S Plus no muestra esta huella, así que verifica tu primera dirección de recepción en Ledger antes de usar la cartera.'
    },
  'Account xpub': { fr: 'xpub du compte', es: 'xpub de la cuenta' },
  'Add hardware signer': { fr: 'Ajouter un signataire matériel', es: 'Añadir firmante físico' },
  'Animated-QR scanners can be added without changing the parser': {
    fr: 'Les scanners QR animés peuvent être ajoutés sans modifier l’analyseur',
    es: 'Se pueden añadir escáneres QR animados sin cambiar el analizador'
  },
  'Before connecting, initialize and unlock the signer. Select any hardware passphrase on-device. Groot imports public data only.':
    {
      fr: 'Avant la connexion, initialisez et déverrouillez le signataire. Sélectionnez toute phrase secrète matérielle sur l’appareil. Groot importe uniquement des données publiques.',
      es: 'Antes de conectar, inicializa y desbloquea el firmante. Selecciona cualquier frase de contraseña en el dispositivo. Groot solo importa datos públicos.'
    },
  'Compare it with the value shown by the hardware signer or its trusted export. A different seed or passphrase produces a different wallet.':
    {
      fr: 'Comparez-la à la valeur affichée par le signataire matériel ou dans son export fiable. Une graine ou phrase secrète différente produit un autre portefeuille.',
      es: 'Compárala con el valor mostrado por el firmante físico o su exportación de confianza. Una semilla o frase de contraseña diferente produce otra cartera.'
    },
  'Compare this Coldcard fingerprint.': {
    fr: 'Comparez cette empreinte Coldcard.',
    es: 'Compara esta huella de Coldcard.'
  },
  'Coldcard Mk4 can show this value on its own screen. Check it before continuing.': {
    fr: 'Coldcard Mk4 peut afficher cette valeur sur son propre écran. Vérifiez-la avant de continuer.',
    es: 'Coldcard Mk4 puede mostrar este valor en su propia pantalla. Compruébalo antes de continuar.'
  },
  'See Coldcard fingerprint steps': {
    fr: 'Voir les étapes pour l’empreinte Coldcard',
    es: 'Ver los pasos de la huella de Coldcard'
  },
  'On Coldcard, return to the main menu and select Advanced/Tools.': {
    fr: 'Sur Coldcard, revenez au menu principal et sélectionnez Advanced/Tools.',
    es: 'En Coldcard, vuelve al menú principal y selecciona Advanced/Tools.'
  },
  'Select View Identity.': {
    fr: 'Sélectionnez View Identity.',
    es: 'Selecciona View Identity.'
  },
  'Compare the 8-character Master Key Fingerprint (XFP) with Groot’s Fingerprint above. Letter case does not matter.':
    {
      fr: 'Comparez la Master Key Fingerprint (XFP) de 8 caractères avec l’empreinte affichée ci-dessus par Groot. La casse des lettres n’a pas d’importance.',
      es: 'Compara la Master Key Fingerprint (XFP) de 8 caracteres con la huella que Groot muestra arriba. Las mayúsculas y minúsculas no importan.'
    },
  'If any character differs, go back and do not create this wallet.': {
    fr: 'Si un caractère diffère, revenez en arrière et ne créez pas ce portefeuille.',
    es: 'Si algún carácter no coincide, vuelve atrás y no crees esta cartera.'
  },
  'Compare the fingerprint with the original wallet or a trusted record when available. After setup, verify the first receive address on the hardware signer before accepting funds.':
    {
      fr: 'Comparez l’empreinte au portefeuille d’origine ou à une référence fiable si disponible. Après la configuration, vérifiez la première adresse de réception sur le signataire matériel avant d’accepter des fonds.',
      es: 'Compara la huella con la cartera original o un registro de confianza cuando esté disponible. Tras la configuración, verifica la primera dirección de recepción en el firmante físico antes de aceptar fondos.'
    },
  'Connect with cable': { fr: 'Connecter par câble', es: 'Conectar por cable' },
  'Descriptor or public export': {
    fr: 'Descripteur ou export public',
    es: 'Descriptor o exportación pública'
  },
  'Device setup guides': {
    fr: 'Guides de configuration des appareils',
    es: 'Guías de configuración de dispositivos'
  },
  'EXTERNAL SIGNER': { fr: 'SIGNATAIRE EXTERNE', es: 'FIRMANTE EXTERNO' },
  'From this computer, an SD card, or a connected drive': {
    fr: 'Depuis cet ordinateur, une carte SD ou un lecteur connecté',
    es: 'Desde este ordenador, una tarjeta SD o una unidad conectada'
  },
  'Import a BIP84 descriptor or xpub by microSD or QR.': {
    fr: 'Importez un descripteur BIP84 ou une xpub par microSD ou QR.',
    es: 'Importa un descriptor BIP84 o una xpub mediante microSD o QR.'
  },
  'Import public backup': { fr: 'Importer une sauvegarde publique', es: 'Importar copia pública' },
  'Jade, BitBox02, Trezor, Ledger, and HWI-compatible devices': {
    fr: 'Jade, BitBox02, Trezor, Ledger et appareils compatibles HWI',
    es: 'Jade, BitBox02, Trezor, Ledger y dispositivos compatibles con HWI'
  },
  'Log in on Jade, then connect USB or import its BIP84 xpub by QR.': {
    fr: 'Connectez-vous sur Jade, puis branchez l’USB ou importez sa xpub BIP84 par QR.',
    es: 'Inicia sesión en Jade y conecta el USB o importa su xpub BIP84 mediante QR.'
  },
  'Nova does not show its fingerprint during this import, so no fingerprint comparison is required here. After setup, verify the first receive address on Nova before accepting bitcoin.':
    {
      fr: 'Nova n’affiche pas son empreinte pendant cet import ; aucune comparaison d’empreinte n’est donc requise ici. Après la configuration, vérifiez la première adresse de réception sur Nova avant d’accepter du bitcoin.',
      es: 'Nova no muestra su huella durante esta importación, así que aquí no es necesario compararla. Tras la configuración, verifica la primera dirección de recepción en Nova antes de aceptar bitcoin.'
    },
  'One key. Signing stays on your hardware device.': {
    fr: 'Une clé. La signature reste sur votre appareil matériel.',
    es: 'Una clave. La firma permanece en tu dispositivo.'
  },
  'Open wallet': { fr: 'Ouvrir le portefeuille', es: 'Abrir cartera' },
  Passport: { fr: 'Passport', es: 'Passport' },
  'Paste QR payload': { fr: 'Coller le contenu QR', es: 'Pegar contenido QR' },
  'PUBLIC DATA REVIEW': {
    fr: 'VÉRIFICATION DES DONNÉES PUBLIQUES',
    es: 'REVISIÓN DE DATOS PÚBLICOS'
  },
  'Quit Ledger Live, unlock Ledger, and open Bitcoin Test.': {
    fr: 'Quittez Ledger Live, déverrouillez Ledger et ouvrez Bitcoin Test.',
    es: 'Cierra Ledger Live, desbloquea Ledger y abre Bitcoin Test.'
  },
  'Review the imported public identity in the next step. You can enable or choose a Trezor passphrase later, but that opens a different hidden wallet; add it to Groot as a separate wallet while this standard wallet remains unchanged.':
    {
      fr: 'Vérifiez l’identité publique importée à l’étape suivante. Vous pourrez activer ou choisir une phrase secrète Trezor plus tard, mais elle ouvrira un portefeuille masqué différent ; ajoutez-le à Groot comme portefeuille distinct tandis que ce portefeuille standard restera inchangé.',
      es: 'Revisa la identidad pública importada en el siguiente paso. Puedes activar o elegir una frase de contraseña de Trezor más adelante, pero abrirá una cartera oculta diferente; añádela a Groot como cartera separada mientras esta cartera estándar permanece sin cambios.'
    },
  'Review the public backup identity.': {
    fr: 'Vérifiez l’identité de la sauvegarde publique.',
    es: 'Revisa la identidad de la copia pública.'
  },
  'Set an app PIN': {
    fr: 'Définir un code PIN pour l’application',
    es: 'Establecer un PIN de la aplicación'
  },
  'Set it directly on Ledger before importing: open device Settings → Security → Passphrase, then choose a temporary passphrase or attach one to a secondary PIN. Go back and import again after activating that wallet. Groot never receives the passphrase.':
    {
      fr: 'Définissez-la directement sur Ledger avant l’import : ouvrez Réglages de l’appareil → Sécurité → Phrase secrète, puis choisissez une phrase temporaire ou associez-en une à un code PIN secondaire. Revenez et relancez l’import après avoir activé ce portefeuille. Groot ne reçoit jamais la phrase secrète.',
      es: 'Configúrala directamente en Ledger antes de importar: abre Ajustes del dispositivo → Seguridad → Frase de contraseña y elige una frase temporal o asígnala a un PIN secundario. Vuelve e importa de nuevo tras activar esa cartera. Groot nunca recibe la frase.'
    },
  Source: { fr: 'Source', es: 'Origen' },
  'The same Trezor can use a passphrase-derived wallet elsewhere and its standard wallet here. They have different fingerprints and addresses.':
    {
      fr: 'Le même Trezor peut utiliser ailleurs un portefeuille dérivé d’une phrase secrète et ici son portefeuille standard. Leurs empreintes et adresses sont différentes.',
      es: 'El mismo Trezor puede usar una cartera derivada de una frase de contraseña en otro lugar y su cartera estándar aquí. Tienen huellas y direcciones diferentes.'
    },
  'This identifies the wallet currently open on Ledger.': {
    fr: 'Cela identifie le portefeuille actuellement ouvert sur Ledger.',
    es: 'Esto identifica la cartera abierta actualmente en Ledger.'
  },
  'This public identity came from the connected Nova.': {
    fr: 'Cette identité publique provient du Nova connecté.',
    es: 'Esta identidad pública procede del Nova conectado.'
  },
  'This public identity came from the connected Trezor.': {
    fr: 'Cette identité publique provient du Trezor connecté.',
    es: 'Esta identidad pública procede del Trezor conectado.'
  },
  'This unlocks this wallet in Groot. Sending bitcoin still requires your hardware signer. It is separate from the PIN and passphrase on that device.':
    {
      fr: 'Ce code déverrouille ce portefeuille dans Groot. L’envoi de bitcoin requiert toujours votre signataire matériel. Il est distinct du PIN et de la phrase secrète de cet appareil.',
      es: 'Esto desbloquea esta cartera en Groot. Para enviar bitcoin sigue siendo necesario el firmante físico. Es independiente del PIN y de la frase de contraseña del dispositivo.'
    },
  'Trezor does not show its master fingerprint during this export, so no fingerprint comparison is required here. After setup, verify the first receive address on the Trezor before accepting bitcoin.':
    {
      fr: 'Trezor n’affiche pas son empreinte principale pendant cet export ; aucune comparaison d’empreinte n’est donc requise ici. Après la configuration, vérifiez la première adresse de réception sur le Trezor avant d’accepter du bitcoin.',
      es: 'Trezor no muestra su huella maestra durante esta exportación, así que aquí no es necesario compararla. Tras la configuración, verifica la primera dirección de recepción en el Trezor antes de aceptar bitcoin.'
    },
  'Unlock BitBox and quit BitBoxApp, then scan.': {
    fr: 'Déverrouillez BitBox et quittez BitBoxApp, puis lancez la recherche.',
    es: 'Desbloquea BitBox, cierra BitBoxApp y luego busca.'
  },
  'Unlock on-device. Model One hidden-wallet passphrases are not supported.': {
    fr: 'Déverrouillez sur l’appareil. Les phrases secrètes de portefeuille masqué ne sont pas prises en charge sur le Model One.',
    es: 'Desbloquea en el dispositivo. No se admiten frases de contraseña de cartera oculta en Model One.'
  },
  'Use standard wallet': { fr: 'Utiliser le portefeuille standard', es: 'Usar cartera estándar' },
  'Confirm this standard wallet to continue.': {
    fr: 'Confirmez ce portefeuille standard pour continuer.',
    es: 'Confirma esta cartera estándar para continuar.'
  },
  'Validate public key': { fr: 'Valider la clé publique', es: 'Validar clave pública' },
  'Verify the fingerprint.': { fr: 'Vérifiez l’empreinte.', es: 'Verifica la huella.' },
  'Want to use a Ledger passphrase?': {
    fr: 'Vous souhaitez utiliser une phrase secrète Ledger ?',
    es: '¿Quieres usar una frase de contraseña de Ledger?'
  },
  'Your hidden wallet is unchanged.': {
    fr: 'Votre portefeuille masqué reste inchangé.',
    es: 'Tu cartera oculta permanece sin cambios.'
  }
} as const satisfies CatalogSection;

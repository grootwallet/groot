import type { CatalogSection } from './types';

// Copy supplied through component properties (modal descriptions, field hints,
// progress labels, placeholders, and accessibility names).
export const attributeCopy = {
  '8 hex characters': { fr: '8 caractères hexadécimaux', es: '8 caracteres hexadecimales' },
  'About backup formats': {
    fr: 'À propos des formats de sauvegarde',
    es: 'Acerca de los formatos de copia de seguridad'
  },
  'About change lineage': {
    fr: 'À propos de la provenance de la monnaie',
    es: 'Acerca del origen del cambio'
  },
  'About coin provenance': {
    fr: 'À propos de la provenance des pièces',
    es: 'Acerca de la procedencia de las monedas'
  },
  'About privacy clusters': {
    fr: 'À propos des groupes de confidentialité',
    es: 'Acerca de los grupos de privacidad'
  },
  'About source payment intent': {
    fr: 'À propos de l’intention du paiement source',
    es: 'Acerca del propósito del pago de origen'
  },
  'About wallet descriptors': {
    fr: 'À propos des descripteurs du portefeuille',
    es: 'Acerca de los descriptores de la cartera'
  },
  'App PIN': { fr: 'Code PIN de l’application', es: 'PIN de la aplicación' },
  'Authorizing…': { fr: 'Autorisation…', es: 'Autorizando…' },
  'Broadcasting…': { fr: 'Diffusion…', es: 'Difundiendo…' },
  'Building policy…': { fr: 'Création de la politique…', es: 'Creando la política…' },
  'Canceling payment…': { fr: 'Annulation du paiement…', es: 'Cancelando el pago…' },
  'Change how this wallet is identified inside Groot.': {
    fr: 'Modifiez la façon dont ce portefeuille est identifié dans Groot.',
    es: 'Cambia cómo se identifica esta cartera en Groot.'
  },
  'Change the local name shown when this signing key is required.': {
    fr: 'Modifiez le nom local affiché lorsque cette clé de signature est requise.',
    es: 'Cambia el nombre local que se muestra cuando se necesita esta clave de firma.'
  },
  'Check the policy, signer keys, and first address.': {
    fr: 'Vérifiez la politique, les clés des signataires et la première adresse.',
    es: 'Comprueba la política, las claves de los firmantes y la primera dirección.'
  },
  'Checking for saved public policy progress…': {
    fr: 'Recherche de la progression de politique publique enregistrée…',
    es: 'Buscando el progreso guardado de la política pública…'
  },
  'Choose how this wallet discovers transactions. Fee estimation and broadcast continue to use the separately configured Bitcoin Core service.':
    {
      fr: 'Choisissez comment ce portefeuille découvre les transactions. L’estimation des frais et la diffusion continuent d’utiliser le service Bitcoin Core configuré séparément.',
      es: 'Elige cómo descubre transacciones esta cartera. La estimación de comisiones y la difusión siguen usando el servicio Bitcoin Core configurado por separado.'
    },
  'Choose how to import this signer’s public account key.': {
    fr: 'Choisissez comment importer la clé de compte publique de ce signataire.',
    es: 'Elige cómo importar la clave pública de cuenta de este firmante.'
  },
  'Compare every value below with the device before approving.': {
    fr: 'Comparez chaque valeur ci-dessous avec l’appareil avant d’approuver.',
    es: 'Compara cada valor siguiente con el dispositivo antes de aprobar.'
  },
  'Compare this exact encoding with the hardware device.': {
    fr: 'Comparez cet encodage exact avec le signataire matériel.',
    es: 'Compara esta codificación exacta con el dispositivo físico.'
  },
  'Compare this exact wallet-controlled output with the hardware device.': {
    fr: 'Comparez cette sortie exacte contrôlée par le portefeuille avec l’appareil.',
    es: 'Compara esta salida exacta controlada por la cartera con el dispositivo.'
  },
  'Compare this wallet-controlled output with the hardware device.': {
    fr: 'Comparez cette sortie contrôlée par le portefeuille avec l’appareil.',
    es: 'Compara esta salida controlada por la cartera con el dispositivo.'
  },
  'Compiling policy…': { fr: 'Compilation de la politique…', es: 'Compilando la política…' },
  'Complete the one-time policy-file import before transaction signing.': {
    fr: 'Terminez l’importation unique du fichier de politique avant de signer des transactions.',
    es: 'Completa la importación única del archivo de política antes de firmar transacciones.'
  },
  'Complete watch-only key imported from this signer.': {
    fr: 'Clé complète en lecture seule importée depuis ce signataire.',
    es: 'Clave completa de solo lectura importada de este firmante.'
  },
  'Confirm app PIN': {
    fr: 'Confirmer le code PIN de l’application',
    es: 'Confirmar PIN de la aplicación'
  },
  'Confirm before returning to the overview.': {
    fr: 'Confirmez avant de revenir à l’aperçu.',
    es: 'Confirma antes de volver al resumen.'
  },
  'Confirm wallet passphrase': {
    fr: 'Confirmer la phrase secrète du portefeuille',
    es: 'Confirmar frase de contraseña de la cartera'
  },
  'Connect one signer. Groot verifies it before adding it.': {
    fr: 'Connectez un signataire. Groot le vérifie avant de l’ajouter.',
    es: 'Conecta un firmante. Groot lo verifica antes de añadirlo.'
  },
  'Connect the signer and scan again. If another wallet app is open, quit it so Groot can use USB.':
    {
      fr: 'Connectez le signataire et relancez la recherche. Si une autre application de portefeuille est ouverte, quittez-la pour que Groot puisse utiliser l’USB.',
      es: 'Conecta el firmante y vuelve a buscar. Si hay otra aplicación de cartera abierta, ciérrala para que Groot pueda usar el USB.'
    },
  'Copy a verified node connection and sync method. Wallet data stays separate.': {
    fr: 'Copiez une connexion de nœud vérifiée et une méthode de synchronisation. Les données des portefeuilles restent séparées.',
    es: 'Copia una conexión de nodo verificada y un método de sincronización. Los datos de las carteras permanecen separados.'
  },
  'Creating wallet…': { fr: 'Création du portefeuille…', es: 'Creando la cartera…' },
  'Deleting…': { fr: 'Suppression…', es: 'Eliminando…' },
  'Derives wallet addresses. Cannot sign.': {
    fr: 'Dérive les adresses du portefeuille. Ne peut pas signer.',
    es: 'Deriva las direcciones de la cartera. No puede firmar.'
  },
  Descriptor: { fr: 'Descripteur', es: 'Descriptor' },
  'Discarding signature…': { fr: 'Suppression de la signature…', es: 'Descartando la firma…' },
  'Discarding…': { fr: 'Abandon…', es: 'Descartando…' },
  'Each wallet keeps isolated, encrypted RPC credentials. Use direct TLS or a local Tor SOCKS proxy remotely.':
    {
      fr: 'Chaque portefeuille conserve des identifiants RPC chiffrés et isolés. À distance, utilisez TLS direct ou un proxy SOCKS Tor local.',
      es: 'Cada cartera guarda credenciales RPC cifradas y aisladas. Para conexiones remotas, usa TLS directo o un proxy SOCKS de Tor local.'
    },
  'Encrypted locally; never placed in the URL or public config.': {
    fr: 'Chiffré localement ; jamais placé dans l’URL ni la configuration publique.',
    es: 'Cifrada localmente; nunca se incluye en la URL ni en la configuración pública.'
  },
  'Finalizing & broadcasting…': {
    fr: 'Finalisation et diffusion…',
    es: 'Finalizando y difundiendo…'
  },
  fingerprint: { fr: 'empreinte', es: 'huella' },
  'Generating address…': { fr: 'Génération de l’adresse…', es: 'Generando dirección…' },
  'Generating securely…': { fr: 'Génération sécurisée…', es: 'Generando de forma segura…' },
  'Groot accepts only crypto-psbt UR frames and verifies the exact proposal before importing.': {
    fr: 'Groot n’accepte que les trames UR crypto-psbt et vérifie la proposition exacte avant l’importation.',
    es: 'Groot solo acepta tramas UR crypto-psbt y verifica la propuesta exacta antes de importarla.'
  },
  'Groot accepts only crypto-psbt UR frames and verifies the exact proposal before merging.': {
    fr: 'Groot n’accepte que les trames UR crypto-psbt et vérifie la proposition exacte avant la fusion.',
    es: 'Groot solo acepta tramas UR crypto-psbt y verifica la propuesta exacta antes de combinarlas.'
  },
  'Groot imports one public account key.': {
    fr: 'Groot importe une clé de compte publique.',
    es: 'Groot importa una clave pública de cuenta.'
  },
  'Hardware signer import in progress': {
    fr: 'Importation du signataire matériel en cours',
    es: 'Importación del firmante físico en curso'
  },
  'Hardware signer setup in progress': {
    fr: 'Configuration du signataire matériel en cours',
    es: 'Configuración del firmante físico en curso'
  },
  'Hardware signer setup progress': {
    fr: 'Progression de la configuration du signataire matériel',
    es: 'Progreso de configuración del firmante físico'
  },
  'Internal wallet output · not the recipient': {
    fr: 'Sortie interne du portefeuille · pas le destinataire',
    es: 'Salida interna de la cartera · no es el destinatario'
  },
  'It can be different for every wallet in Groot.': {
    fr: 'Il peut être différent pour chaque portefeuille dans Groot.',
    es: 'Puede ser distinto para cada cartera en Groot.'
  },
  'It remains monitored but will never be offered again.': {
    fr: 'Elle reste surveillée mais ne sera plus jamais proposée.',
    es: 'Se seguirá supervisando, pero no se volverá a ofrecer.'
  },
  'It will be retired and never shown for payment again.': {
    fr: 'Elle sera retirée et ne sera plus jamais affichée pour un paiement.',
    es: 'Se retirará y no volverá a mostrarse para pagos.'
  },
  'Keep it connected and unlocked.': {
    fr: 'Gardez-le connecté et déverrouillé.',
    es: 'Mantenlo conectado y desbloqueado.'
  },
  'Keep it connected while the device checks the selected PIN positions.': {
    fr: 'Gardez-le connecté pendant que l’appareil vérifie les positions du code PIN sélectionnées.',
    es: 'Mantenlo conectado mientras el dispositivo comprueba las posiciones del PIN seleccionadas.'
  },
  'Keep it with your recovery words. It also unlocks Groot on this device.': {
    fr: 'Conservez-la avec vos mots de récupération. Elle déverrouille aussi Groot sur cet appareil.',
    es: 'Guárdala con tus palabras de recuperación. También desbloquea Groot en este dispositivo.'
  },
  'Keep the saved signer connected and unlocked while Groot checks its account key.': {
    fr: 'Gardez le signataire enregistré connecté et déverrouillé pendant que Groot vérifie sa clé de compte.',
    es: 'Mantén el firmante guardado conectado y desbloqueado mientras Groot comprueba su clave de cuenta.'
  },
  'Keep this transaction and remove its hardware signature from Groot.': {
    fr: 'Conservez cette transaction et retirez sa signature matérielle de Groot.',
    es: 'Conserva esta transacción y elimina de Groot su firma del dispositivo.'
  },
  'Keep Trezor connected while Groot reads its public account key.': {
    fr: 'Gardez Trezor connecté pendant que Groot lit sa clé de compte publique.',
    es: 'Mantén Trezor conectado mientras Groot lee su clave pública de cuenta.'
  },
  'Keep Trezor connected while Groot reads its public BIP48 account key.': {
    fr: 'Gardez Trezor connecté pendant que Groot lit sa clé de compte publique BIP48.',
    es: 'Mantén Trezor conectado mientras Groot lee su clave pública de cuenta BIP48.'
  },
  'Labels cannot be changed.': {
    fr: 'Les libellés ne peuvent pas être modifiés.',
    es: 'Las etiquetas no se pueden cambiar.'
  },
  'New app PIN': { fr: 'Nouveau code PIN de l’application', es: 'Nuevo PIN de la aplicación' },
  'No private key or seed should ever be entered here.': {
    fr: 'Aucune clé privée ni graine ne doit jamais être saisie ici.',
    es: 'Nunca debes introducir aquí una clave privada ni una semilla.'
  },
  'Only a valid signature from this wallet’s exact fingerprint is accepted.': {
    fr: 'Seule une signature valide provenant de l’empreinte exacte de ce portefeuille est acceptée.',
    es: 'Solo se acepta una firma válida de la huella exacta de esta cartera.'
  },
  'Only signatures for this exact proposal are accepted.': {
    fr: 'Seules les signatures de cette proposition exacte sont acceptées.',
    es: 'Solo se aceptan firmas para esta propuesta exacta.'
  },
  'Opening recovery words…': {
    fr: 'Ouverture des mots de récupération…',
    es: 'Abriendo las palabras de recuperación…'
  },
  'Opening save dialog…': {
    fr: 'Ouverture de la boîte de dialogue d’enregistrement…',
    es: 'Abriendo el diálogo de guardado…'
  },
  'Opening verification…': { fr: 'Ouverture de la vérification…', es: 'Abriendo la verificación…' },
  'Passphrase protection can expose several independent wallets from the same device.': {
    fr: 'La protection par phrase secrète peut exposer plusieurs portefeuilles indépendants depuis le même appareil.',
    es: 'La protección con frase de contraseña puede mostrar varias carteras independientes del mismo dispositivo.'
  },
  'Saved receive record for this wallet.': {
    fr: 'Enregistrement de réception sauvegardé pour ce portefeuille.',
    es: 'Registro de recepción guardado para esta cartera.'
  },
  'Preparing acceleration…': {
    fr: 'Préparation de l’accélération…',
    es: 'Preparando la aceleración…'
  },
  'Preparing payment…': { fr: 'Préparation du paiement…', es: 'Preparando el pago…' },
  'Preparing…': { fr: 'Préparation…', es: 'Preparando…' },
  'Protects the copied connection for this wallet.': {
    fr: 'Protège la connexion copiée pour ce portefeuille.',
    es: 'Protege la conexión copiada para esta cartera.'
  },
  'Public signer identity. No private keys stored.': {
    fr: 'Identité publique du signataire. Aucune clé privée enregistrée.',
    es: 'Identidad pública del firmante. No se guardan claves privadas.'
  },
  'Public watch-only logic for receiving and change. It cannot sign transactions, but it reveals wallet activity.':
    {
      fr: 'Logique publique en lecture seule pour la réception et la monnaie. Elle ne peut pas signer de transactions, mais révèle l’activité du portefeuille.',
      es: 'Lógica pública de solo lectura para recibir y el cambio. No puede firmar transacciones, pero revela la actividad de la cartera.'
    },
  'Quit other wallet apps so Groot can use USB.': {
    fr: 'Quittez les autres applications de portefeuille pour que Groot puisse utiliser l’USB.',
    es: 'Cierra las demás aplicaciones de cartera para que Groot pueda usar el USB.'
  },
  'Re-authenticate before exposing wallet metadata.': {
    fr: 'Réauthentifiez-vous avant d’exposer les métadonnées du portefeuille.',
    es: 'Vuelve a autenticarte antes de mostrar los metadatos de la cartera.'
  },
  'Received and sent transactions will appear here.': {
    fr: 'Les transactions reçues et envoyées apparaîtront ici.',
    es: 'Las transacciones recibidas y enviadas aparecerán aquí.'
  },
  'Received bitcoin will appear here after this wallet has synchronized.': {
    fr: 'Le bitcoin reçu apparaîtra ici après la synchronisation de ce portefeuille.',
    es: 'El bitcoin recibido aparecerá aquí cuando esta cartera se haya sincronizado.'
  },
  'Recommended now, but optional during coordinator creation. Coldcard must know the complete policy before it signs.':
    {
      fr: 'Recommandé maintenant, mais facultatif lors de la création du coordinateur. Coldcard doit connaître la politique complète avant de signer.',
      es: 'Se recomienda ahora, pero es opcional durante la creación del coordinador. Coldcard debe conocer la política completa antes de firmar.'
    },
  'Recommended now, but optional during coordinator creation. Register the policy and prove its first receive address before first use.':
    {
      fr: 'Recommandé maintenant, mais facultatif lors de la création du coordinateur. Enregistrez la politique et vérifiez sa première adresse de réception avant la première utilisation.',
      es: 'Se recomienda ahora, pero es opcional durante la creación del coordinador. Registra la política y verifica su primera dirección de recepción antes del primer uso.'
    },
  'Recover this watch-only wallet without exposing the Ledger seed.': {
    fr: 'Récupérez ce portefeuille en lecture seule sans exposer la graine Ledger.',
    es: 'Recupera esta cartera de solo lectura sin exponer la semilla de Ledger.'
  },
  'Recovering wallet…': { fr: 'Récupération du portefeuille…', es: 'Recuperando la cartera…' },
  "Remove this signer from Groot's current proposal.": {
    fr: 'Retirez ce signataire de la proposition actuelle de Groot.',
    es: 'Elimina este firmante de la propuesta actual de Groot.'
  },
  'Remove this unfinished public wallet setup from Groot.': {
    fr: 'Retirez de Groot cette configuration de portefeuille public inachevée.',
    es: 'Elimina de Groot esta configuración incompleta de cartera pública.'
  },
  'Requesting…': { fr: 'Demande…', es: 'Solicitando…' },
  'Required · cannot be changed': {
    fr: 'Obligatoire · ne peut pas être modifié',
    es: 'Obligatoria · no se puede cambiar'
  },
  'Required once to protect this wallet’s RPC credentials.': {
    fr: 'Requis une fois pour protéger les identifiants RPC de ce portefeuille.',
    es: 'Se requiere una vez para proteger las credenciales RPC de esta cartera.'
  },
  'Required to change this wallet’s network privacy boundary.': {
    fr: 'Requis pour modifier la frontière de confidentialité réseau de ce portefeuille.',
    es: 'Se requiere para cambiar el límite de privacidad de red de esta cartera.'
  },
  'Required to decrypt the recovery words only inside trusted Rust code.': {
    fr: 'Requise pour déchiffrer les mots de récupération uniquement dans le code Rust de confiance.',
    es: 'Se requiere para descifrar las palabras de recuperación solo dentro del código Rust de confianza.'
  },
  'Review what will be discarded before continuing.': {
    fr: 'Vérifiez ce qui sera abandonné avant de continuer.',
    es: 'Revisa qué se descartará antes de continuar.'
  },
  'RPC password': { fr: 'Mot de passe RPC', es: 'Contraseña RPC' },
  'Saving confirmation…': {
    fr: 'Enregistrement de la confirmation…',
    es: 'Guardando la confirmación…'
  },
  'Saving label…': { fr: 'Enregistrement du libellé…', es: 'Guardando la etiqueta…' },
  'Saving PSBT…': { fr: 'Enregistrement de la PSBT…', es: 'Guardando la PSBT…' },
  'Saving signed PSBT…': {
    fr: 'Enregistrement de la PSBT signée…',
    es: 'Guardando la PSBT firmada…'
  },
  'Saving…': { fr: 'Enregistrement…', es: 'Guardando…' },
  'Scan to pay this exact address.': {
    fr: 'Scannez pour payer cette adresse exacte.',
    es: 'Escanea para pagar a esta dirección exacta.'
  },
  'Scan to pay this exact descriptor address.': {
    fr: 'Scannez pour payer cette adresse exacte du descripteur.',
    es: 'Escanea para pagar a esta dirección exacta del descriptor.'
  },
  'Scan with an offline signer. No private data is encoded.': {
    fr: 'Scannez avec un signataire hors ligne. Aucune donnée privée n’est encodée.',
    es: 'Escanea con un firmante sin conexión. No se codifican datos privados.'
  },
  'Scan with an offline signer. No private key data is encoded.': {
    fr: 'Scannez avec un signataire hors ligne. Aucune donnée de clé privée n’est encodée.',
    es: 'Escanea con un firmante sin conexión. No se codifican datos de claves privadas.'
  },
  'Scanning blocks…': { fr: 'Analyse des blocs…', es: 'Escaneando bloques…' },
  'Search from the earliest possible payment while deriving a bounded address gap.': {
    fr: 'Recherchez depuis le premier paiement possible en dérivant un écart d’adresses limité.',
    es: 'Busca desde el primer pago posible derivando un intervalo de direcciones limitado.'
  },
  'Signer scan in progress': {
    fr: 'Recherche de signataire en cours',
    es: 'Búsqueda de firmante en curso'
  },
  'Signing & broadcasting…': { fr: 'Signature et diffusion…', es: 'Firmando y difundiendo…' },
  'Software wallet setup progress': {
    fr: 'Progression de la configuration du portefeuille logiciel',
    es: 'Progreso de configuración de la cartera de software'
  },
  'Testing connection…': { fr: 'Test de la connexion…', es: 'Probando la conexión…' },
  'Testing recovery…': { fr: 'Test de la récupération…', es: 'Probando la recuperación…' },
  'The BIP39 passphrase kept with this software wallet’s recovery words.': {
    fr: 'La phrase secrète BIP39 conservée avec les mots de récupération de ce portefeuille logiciel.',
    es: 'La frase de contraseña BIP39 guardada con las palabras de recuperación de esta cartera de software.'
  },
  'This also identifies the signer inside Groot': {
    fr: 'Ceci identifie également le signataire dans Groot',
    es: 'Esto también identifica al firmante dentro de Groot'
  },
  'This cannot be undone on this device.': {
    fr: 'Cette action est irréversible sur cet appareil.',
    es: 'Esta acción no se puede deshacer en este dispositivo.'
  },
  'This does not change descriptors, signer identity, recovery data, or saved public backups': {
    fr: 'Cela ne modifie pas les descripteurs, l’identité du signataire, les données de récupération ni les sauvegardes publiques enregistrées',
    es: 'Esto no cambia los descriptores, la identidad del firmante, los datos de recuperación ni las copias públicas guardadas'
  },
  'This does not change the device, fingerprint, public keys, descriptors, or saved public backups':
    {
      fr: 'Cela ne modifie pas l’appareil, l’empreinte, les clés publiques, les descripteurs ni les sauvegardes publiques enregistrées',
      es: 'Esto no cambia el dispositivo, la huella, las claves públicas, los descriptores ni las copias públicas guardadas'
    },
  'This exact BIP39 passphrase is required with the recovery words and also unlocks Groot.': {
    fr: 'Cette phrase secrète BIP39 exacte est requise avec les mots de récupération et déverrouille également Groot.',
    es: 'Esta frase de contraseña BIP39 exacta es necesaria con las palabras de recuperación y también desbloquea Groot.'
  },
  'This output was verified by the Rust wallet as controlled by this wallet.': {
    fr: 'Le portefeuille Rust a vérifié que cette sortie est contrôlée par ce portefeuille.',
    es: 'La cartera Rust verificó que esta salida está controlada por esta cartera.'
  },
  'This permanently removes wallet data from this device.': {
    fr: 'Cela supprime définitivement les données du portefeuille de cet appareil.',
    es: 'Esto elimina permanentemente los datos de la cartera de este dispositivo.'
  },
  'This PIN protects local Groot data. It is separate from every hardware-signer credential.': {
    fr: 'Ce code PIN protège les données locales de Groot. Il est distinct de chaque identifiant du signataire matériel.',
    es: 'Este PIN protege los datos locales de Groot. Es independiente de las credenciales de cada firmante físico.'
  },
  'This public backup recovers every wallet address and coordinates signatures. It cannot spend, but it reveals wallet activity.':
    {
      fr: 'Cette sauvegarde publique récupère toutes les adresses du portefeuille et coordonne les signatures. Elle ne peut pas dépenser, mais révèle l’activité du portefeuille.',
      es: 'Esta copia pública recupera todas las direcciones de la cartera y coordina firmas. No puede gastar, pero revela la actividad de la cartera.'
    },
  'This received address has no local label. Assign it once; the assignment cannot be changed.': {
    fr: 'Cette adresse de réception n’a pas de libellé local. Attribuez-la une seule fois ; l’attribution ne pourra pas être modifiée.',
    es: 'Esta dirección recibida no tiene una etiqueta local. Asígnala una sola vez; la asignación no se podrá cambiar.'
  },
  'This selects the seed-derived wallet with no hardware passphrase.': {
    fr: 'Cela sélectionne le portefeuille dérivé de la graine sans phrase secrète matérielle.',
    es: 'Esto selecciona la cartera derivada de la semilla sin frase de contraseña del dispositivo.'
  },
  'This watch-only descriptor cannot spend bitcoin, but it reveals the wallet’s complete activity.':
    {
      fr: 'Ce descripteur en lecture seule ne peut pas dépenser de bitcoin, mais révèle toute l’activité du portefeuille.',
      es: 'Este descriptor de solo lectura no puede gastar bitcoin, pero revela toda la actividad de la cartera.'
    },
  'Trezor unlock in progress': {
    fr: 'Déverrouillage de Trezor en cours',
    es: 'Desbloqueo de Trezor en curso'
  },
  'Unlock the signer, quit other wallet apps, then scan again.': {
    fr: 'Déverrouillez le signataire, quittez les autres applications de portefeuille, puis relancez la recherche.',
    es: 'Desbloquea el firmante, cierra las demás aplicaciones de cartera y vuelve a buscar.'
  },
  'Unlocking wallet…': { fr: 'Déverrouillage du portefeuille…', es: 'Desbloqueando la cartera…' },
  'Use the device’s own screen to confirm identity and passphrase wallet.': {
    fr: 'Utilisez l’écran de l’appareil pour confirmer l’identité et le portefeuille protégé par phrase secrète.',
    es: 'Usa la pantalla del dispositivo para confirmar la identidad y la cartera con frase de contraseña.'
  },
  'Use the same passphrase-protected hardware signer whose fingerprint you imported.': {
    fr: 'Utilisez le même signataire matériel protégé par phrase secrète dont vous avez importé l’empreinte.',
    es: 'Usa el mismo firmante físico protegido con frase de contraseña cuya huella importaste.'
  },
  'Use your written 24 words for a private native proof, or reveal them securely first if you still need to make the backup.':
    {
      fr: 'Utilisez vos 24 mots écrits pour une preuve native privée, ou affichez-les d’abord de façon sécurisée si vous devez encore créer la sauvegarde.',
      es: 'Usa tus 24 palabras escritas para una prueba nativa privada o muéstralas primero de forma segura si aún necesitas crear la copia de seguridad.'
    },
  'Validating backup…': {
    fr: 'Validation de la sauvegarde…',
    es: 'Validando la copia de seguridad…'
  },
  'Validating signatures…': { fr: 'Validation des signatures…', es: 'Validando las firmas…' },
  'Validating…': { fr: 'Validation…', es: 'Validando…' },
  'Verifying…': { fr: 'Vérification…', es: 'Verificando…' },
  'Wallet change': { fr: 'Monnaie du portefeuille', es: 'Cambio de la cartera' },
  'Wallet creation progress': {
    fr: 'Progression de la création du portefeuille',
    es: 'Progreso de creación de la cartera'
  },
  'Wallet passphrase': {
    fr: 'Phrase secrète du portefeuille',
    es: 'Frase de contraseña de la cartera'
  },
  'What does this test do?': { fr: 'Que fait ce test ?', es: '¿Qué hace esta prueba?' },
  'You can rename this local Groot wallet without changing its signer identity': {
    fr: 'Vous pouvez renommer ce portefeuille Groot local sans modifier l’identité de son signataire',
    es: 'Puedes cambiar el nombre de esta cartera local de Groot sin modificar la identidad de su firmante'
  }
} satisfies CatalogSection;

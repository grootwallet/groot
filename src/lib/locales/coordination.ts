import type { CatalogSection } from './types';

export const coordinationCopy = {
  'Mobile signing requires the complete previous transaction for every input. Export the full PSBT from the coordinator.':
    {
      fr: 'La signature mobile nécessite la transaction précédente complète pour chaque entrée. Exportez la PSBT complète depuis le coordinateur.',
      es: 'La firma móvil requiere la transacción anterior completa para cada entrada. Exporta la PSBT completa desde el coordinador.'
    },
  'A PSBT input does not match its authenticated previous output.': {
    fr: 'Une entrée PSBT ne correspond pas à sa sortie précédente authentifiée.',
    es: 'Una entrada PSBT no coincide con su salida anterior autenticada.'
  },
  'A PSBT input does not match its previous transaction.': {
    fr: 'Une entrée PSBT ne correspond pas à sa transaction précédente.',
    es: 'Una entrada PSBT no coincide con su transacción anterior.'
  },
  'A PSBT input points outside its previous transaction.': {
    fr: 'Une entrée PSBT référence une sortie inexistante de sa transaction précédente.',
    es: 'Una entrada PSBT apunta a una salida inexistente de su transacción anterior.'
  },
  'The PSBT repeats an input.': {
    fr: 'La PSBT contient une entrée en double.',
    es: 'La PSBT repite una entrada.'
  },
  'Pair phone': { fr: 'Associer le téléphone', es: 'Emparejar teléfono' },
  'Back up the policy and verify its first address.': {
    fr: 'Sauvegardez la politique et vérifiez sa première adresse.',
    es: 'Guarda la política y verifica su primera dirección.'
  },
  'Any {count} keys can sign.': {
    fr: '{count} clés au choix peuvent signer.',
    es: 'Pueden firmar cualesquiera {count} claves.'
  },

  'Connect a trusted node to sync this wallet.': {
    fr: 'Connectez un nœud de confiance pour synchroniser ce portefeuille.',
    es: 'Conecta un nodo de confianza para sincronizar esta cartera.'
  },
  'Desktop coordinator': { fr: 'Coordinateur sur ordinateur', es: 'Coordinador de escritorio' },
  'Finish on desktop': { fr: 'Terminer sur ordinateur', es: 'Terminar en el ordenador' },
  'Phone signer': {
    fr: 'Signataire mobile',
    es: 'Firmante móvil'
  },
  'Verify backup': {
    fr: 'Vérifier la sauvegarde',
    es: 'Verificar la copia'
  },
  'Have your 24 recovery words ready.': {
    fr: 'Préparez vos 24 mots de récupération.',
    es: 'Ten listas tus 24 palabras de recuperación.'
  },
  'QR connection': { fr: 'Connexion QR', es: 'Conexión QR' },
  'QR verified': { fr: 'QR vérifié', es: 'QR verificado' },
  'Scan the final wallet QR shown on desktop.': {
    fr: 'Scannez le QR final du portefeuille sur l’ordinateur.',
    es: 'Escanea el QR final de la cartera en el ordenador.'
  },
  'Verify your written recovery words.': {
    fr: 'Vérifiez vos mots de récupération écrits.',
    es: 'Verifica las palabras de recuperación que has anotado.'
  },
  'Verify your written words later in Policy.': {
    fr: 'Vérifiez vos mots plus tard dans Politique.',
    es: 'Verifica tus palabras más tarde en Política.'
  },
  'Watch-only wallet': { fr: 'Portefeuille en lecture seule', es: 'Cartera de solo lectura' },

  'Backup verification failed': {
    fr: 'Échec de la vérification de la sauvegarde',
    es: 'No se pudo verificar la copia de seguridad'
  },
  'Pairing can continue. Verify your written phone words from the shared wallet after setup.': {
    fr: 'Vous pouvez continuer l’association. Vérifiez les mots écrits du téléphone depuis le portefeuille partagé après la configuration.',
    es: 'Puedes continuar el emparejamiento. Verifica las palabras escritas del teléfono desde la cartera compartida después de configurarla.'
  },
  'Show recovery words': {
    fr: 'Afficher les mots de récupération',
    es: 'Mostrar las palabras de recuperación'
  },
  'Verify phone backup': {
    fr: 'Vérifier la sauvegarde du téléphone',
    es: 'Verificar la copia del teléfono'
  },
  'Verify phone recovery backup': {
    fr: 'Vérifier la sauvegarde de récupération du téléphone',
    es: 'Verificar la copia de recuperación del teléfono'
  },

  'Receive on desktop': { fr: 'Recevoir sur ordinateur', es: 'Recibir en el ordenador' },
  RBF: { fr: 'RBF', es: 'RBF' },
  vB: { fr: 'vB', es: 'vB' },
  'Estimated size': { fr: 'Taille estimée', es: 'Tamaño estimado' },
  Locktime: { fr: 'Verrou temporel', es: 'Bloqueo temporal' },
  'This QR could not be verified.': {
    fr: 'Ce QR n’a pas pu être vérifié.',
    es: 'No se pudo verificar este QR.'
  },
  'Device authorization was cancelled. No key was released. Try again when ready.': {
    fr: 'Autorisation de l’appareil annulée. Aucune clé n’a été déverrouillée. Réessayez quand vous êtes prêt.',
    es: 'Se canceló la autorización del dispositivo. No se desbloqueó ninguna clave. Vuelve a intentarlo cuando quieras.'
  },
  'This phone could not release the device-bound wallet key. Check the device passcode or restore from the written backup.':
    {
      fr: 'Ce téléphone n’a pas pu déverrouiller la clé du portefeuille liée à l’appareil. Vérifiez son code ou restaurez avec la sauvegarde écrite.',
      es: 'Este teléfono no pudo desbloquear la clave de la cartera vinculada al dispositivo. Comprueba su código o restaura con la copia escrita.'
    },
  'Check phone key': { fr: 'Vérifier la clé du téléphone', es: 'Comprobar clave del teléfono' },
  'Encrypted signing key stored on this phone.': {
    fr: 'Clé de signature chiffrée stockée sur ce téléphone.',
    es: 'Clave de firma cifrada guardada en este teléfono.'
  },
  'Enter the app PIN to decrypt this phone key and prove it matches the wallet policy.': {
    fr: 'Saisissez le code PIN de l’app pour déchiffrer cette clé et prouver qu’elle correspond à la politique du portefeuille.',
    es: 'Introduce el PIN de la app para descifrar esta clave y demostrar que coincide con la política de la cartera.'
  },
  'Enter the app PIN to prove this phone key still matches the wallet.': {
    fr: 'Saisissez le code PIN de l’app pour prouver que cette clé correspond toujours au portefeuille.',
    es: 'Introduce el PIN de la app para demostrar que esta clave aún coincide con la cartera.'
  },
  'Phone key check': {
    fr: 'Contrôle de la clé du téléphone',
    es: 'Comprobación de la clave del teléfono'
  },
  'Phone key verified': { fr: 'Clé du téléphone vérifiée', es: 'Clave del teléfono verificada' },
  'The encrypted key on this phone matches the wallet policy.': {
    fr: 'La clé chiffrée de ce téléphone correspond à la politique du portefeuille.',
    es: 'La clave cifrada de este teléfono coincide con la política de la cartera.'
  },
  'Accountless · encrypted two-QR pairing': {
    fr: 'Sans compte · jumelage chiffré par deux QR',
    es: 'Sin cuenta · vinculación cifrada con dos QR'
  },
  'Add a Groot phone': { fr: 'Ajouter un téléphone Groot', es: 'Añadir un teléfono Groot' },
  'Add one recoverable phone signer to this wallet.': {
    fr: 'Ajoutez à ce portefeuille un signataire mobile récupérable.',
    es: 'Añade a esta cartera un firmante móvil recuperable.'
  },
  'One Groot phone signer per wallet in V1': {
    fr: 'Un signataire téléphonique Groot par portefeuille dans la V1',
    es: 'Un firmante de teléfono Groot por cartera en V1'
  },
  'Add this phone as one signer in a shared wallet.': {
    fr: 'Ajoutez ce téléphone comme signataire d’un portefeuille partagé.',
    es: 'Añade este teléfono como firmante de una cartera compartida.'
  },
  'Both devices must show': {
    fr: 'Les deux appareils doivent afficher',
    es: 'Ambos dispositivos deben mostrar'
  },
  'Back to wallet': { fr: 'Retour au portefeuille', es: 'Volver a la cartera' },
  'Available on this phone': {
    fr: 'Disponible sur ce téléphone',
    es: 'Disponible en este teléfono'
  },
  'Managed on desktop': { fr: 'Géré sur l’ordinateur', es: 'Gestionado en el ordenador' },
  'Connect on desktop': { fr: 'Connecter sur l’ordinateur', es: 'Conectar en el ordenador' },
  'Signing key held by this phone': {
    fr: 'Clé de signature détenue par ce téléphone',
    es: 'Clave de firma guardada en este teléfono'
  },
  'Signer details received from desktop': {
    fr: 'Détails du signataire reçus de l’ordinateur',
    es: 'Detalles del firmante recibidos del ordenador'
  },
  'Device type': { fr: 'Type d’appareil', es: 'Tipo de dispositivo' },
  'This phone holds this key. Its fingerprint and public account key match the wallet policy.': {
    fr: 'Ce téléphone détient cette clé. Son empreinte et sa clé publique de compte correspondent à la politique du portefeuille.',
    es: 'Este teléfono guarda esta clave. Su huella y clave pública de cuenta coinciden con la política de la cartera.'
  },
  'Identity and device details came from the authenticated desktop wallet policy. Connect and verify this signer on desktop.':
    {
      fr: 'L’identité et les détails de l’appareil proviennent de la politique authentifiée de l’ordinateur. Connectez et vérifiez ce signataire sur l’ordinateur.',
      es: 'La identidad y los detalles del dispositivo proceden de la política autenticada del ordenador. Conecta y verifica este firmante en el ordenador.'
    },
  'Cannot sign': { fr: 'Ne peut pas signer', es: 'No puede firmar' },
  'Cancel pending pairing': {
    fr: 'Annuler le jumelage en attente',
    es: 'Cancelar vinculación pendiente'
  },
  'Cancel pairing': { fr: 'Annuler le jumelage', es: 'Cancelar vinculación' },
  'Codes match. Add signer': {
    fr: 'Les codes correspondent. Ajouter le signataire',
    es: 'Los códigos coinciden. Añadir firmante'
  },
  'Six digits match — add signer': {
    fr: 'Les six chiffres correspondent — ajouter le signataire',
    es: 'Los seis dígitos coinciden — añadir firmante'
  },
  'Compare the six digits, then let desktop scan this response.': {
    fr: 'Comparez les six chiffres, puis laissez l’ordinateur scanner cette réponse.',
    es: 'Compara los seis dígitos y deja que el ordenador escanee esta respuesta.'
  },
  'Compare the threshold and first address shown on desktop before completing.': {
    fr: 'Comparez le seuil et la première adresse affichés sur l’ordinateur avant de terminer.',
    es: 'Compara el umbral y la primera dirección mostrados en el ordenador antes de terminar.'
  },
  'Confirm PIN': { fr: 'Confirmer le PIN', es: 'Confirmar PIN' },
  'Confirm the phone shows the same digits': {
    fr: 'Confirmez que le téléphone affiche les mêmes chiffres',
    es: 'Confirma que el teléfono muestra los mismos dígitos'
  },
  'Create phone key': { fr: 'Créer la clé du téléphone', es: 'Crear clave del teléfono' },
  Desktop: { fr: 'Ordinateur', es: 'Ordenador' },
  'Desktop scanned this phone key': {
    fr: 'L’ordinateur a scanné cette clé téléphone',
    es: 'El ordenador escaneó esta clave del teléfono'
  },
  'Creating one-time invitation': {
    fr: 'Création de l’invitation à usage unique',
    es: 'Creando invitación de un solo uso'
  },
  'Phone key added on desktop': {
    fr: 'Clé du téléphone ajoutée sur l’ordinateur',
    es: 'Clave del teléfono añadida en el ordenador'
  },
  'Phone key fingerprint': {
    fr: 'Empreinte de la clé du téléphone',
    es: 'Huella de la clave del teléfono'
  },
  'Retry final phone QR': {
    fr: 'Réessayer le QR final du téléphone',
    es: 'Reintentar el QR final del teléfono'
  },
  'Save the wallet descriptor.': {
    fr: 'Enregistrez le descripteur du portefeuille.',
    es: 'Guarda el descriptor de la cartera.'
  },
  'Store signers separately.': {
    fr: 'Conservez les signataires séparément.',
    es: 'Guarda los firmantes por separado.'
  },
  'Verify keys on each signer.': {
    fr: 'Vérifiez les clés sur chaque signataire.',
    es: 'Verifica las claves en cada firmante.'
  },
  desktop_coordinator: { fr: 'coordinateur_ordinateur', es: 'coordinador_ordenador' },
  'Device role unavailable': {
    fr: 'Rôle de l’appareil indisponible',
    es: 'Rol del dispositivo no disponible'
  },
  'Encrypted mobile signer QR': {
    fr: 'QR chiffré du signataire mobile',
    es: 'QR cifrado del firmante móvil'
  },
  Fee: { fr: 'Frais', es: 'Comisión' },
  'Final shared wallet policy QR': {
    fr: 'QR final de la politique du portefeuille partagé',
    es: 'QR final de la política de la cartera compartida'
  },
  'Finish the other signers, then return the final wallet QR to the phone.': {
    fr: 'Terminez les autres signataires, puis renvoyez le QR final du portefeuille au téléphone.',
    es: 'Termina con los demás firmantes y devuelve al teléfono el QR final de la cartera.'
  },
  'Finish an interrupted pairing': {
    fr: 'Terminer un jumelage interrompu',
    es: 'Terminar una vinculación interrumpida'
  },
  'Finish shared wallet setup': {
    fr: 'Terminer la configuration du portefeuille partagé',
    es: 'Finalizar la configuración de la cartera compartida'
  },
  'frame {current} of {total}': {
    fr: 'trame {current} sur {total}',
    es: 'fragmento {current} de {total}'
  },
  'Groot is generating a fresh 128-bit BIP129 token.': {
    fr: 'Groot génère un nouveau jeton BIP129 de 128 bits.',
    es: 'Groot está generando un nuevo token BIP129 de 128 bits.'
  },
  'Groot phone invitation QR': {
    fr: 'QR d’invitation du téléphone Groot',
    es: 'QR de invitación del teléfono Groot'
  },
  'Import a desktop hardware wallet': {
    fr: 'Importer un portefeuille matériel de l’ordinateur',
    es: 'Importar una cartera física del ordenador'
  },
  'Import a hardware wallet without its signing key.': {
    fr: 'Importez un portefeuille matériel sans sa clé de signature.',
    es: 'Importa una cartera física sin su clave de firma.'
  },
  'Import watch-only wallet': {
    fr: 'Importer le portefeuille en lecture seule',
    es: 'Importar cartera de solo lectura'
  },
  Invitation: { fr: 'Invitation', es: 'Invitación' },
  'In Groot desktop open Settings → Export & verify → Show on phone.': {
    fr: 'Dans Groot sur ordinateur, ouvrez Réglages → Exporter et vérifier → Afficher sur le téléphone.',
    es: 'En Groot para ordenador, abre Ajustes → Exportar y verificar → Mostrar en el teléfono.'
  },
  'Join a shared wallet': {
    fr: 'Rejoindre un portefeuille partagé',
    es: 'Unirse a una cartera compartida'
  },
  'Connect desktop app': {
    fr: 'Connecter l’application de bureau',
    es: 'Conectar aplicación de escritorio'
  },
  'Let desktop scan the signed PSBT. Groot did not broadcast it.': {
    fr: 'Laissez l’ordinateur scanner la PSBT signée. Groot ne l’a pas diffusée.',
    es: 'Deja que el ordenador escanee la PSBT firmada. Groot no la ha transmitido.'
  },
  'Let desktop scan this response': {
    fr: 'Laissez l’ordinateur scanner cette réponse',
    es: 'Deja que el ordenador escanee esta respuesta'
  },
  'Local app PIN': { fr: 'PIN local de l’application', es: 'PIN local de la aplicación' },
  'Mobile key ready': { fr: 'Clé mobile prête', es: 'Clave móvil lista' },
  mobile_cosigner: { fr: 'cosignataire_mobile', es: 'cofirmante_móvil' },
  'No account': { fr: 'Aucun compte', es: 'Sin cuenta' },
  'No account or cloud connection. Keep both devices together until the two QR rounds finish.': {
    fr: 'Aucun compte ni connexion au cloud. Gardez les deux appareils ensemble jusqu’à la fin des deux échanges QR.',
    es: 'Sin cuenta ni conexión a la nube. Mantén juntos ambos dispositivos hasta terminar los dos intercambios QR.'
  },
  'On desktop choose “Scan signed PSBT.” Desktop will reject any signature that does not match the exact reviewed proposal.':
    {
      fr: 'Sur l’ordinateur, choisissez « Scanner la PSBT signée ». Toute signature ne correspondant pas exactement à la proposition vérifiée sera refusée.',
      es: 'En el ordenador, elige « Escanear PSBT firmada ». Se rechazará cualquier firma que no coincida exactamente con la propuesta revisada.'
    },
  'On the phone, choose “Connect desktop app” and scan this one-time QR. Keep the response private.':
    {
      fr: 'Sur le téléphone, choisissez « Connecter l’application de bureau » et scannez ce QR à usage unique. Gardez la réponse privée.',
      es: 'En el teléfono, elige « Conectar aplicación de escritorio » y escanea este QR de un solo uso. Mantén privada la respuesta.'
    },
  'On the phone choose “Watch desktop wallet.” This QR contains public descriptors only and cannot sign.':
    {
      fr: 'Sur le téléphone, choisissez « Surveiller le portefeuille de l’ordinateur ». Ce QR ne contient que des descripteurs publics et ne peut pas signer.',
      es: 'En el teléfono, elige « Ver cartera del ordenador ». Este QR solo contiene descriptores públicos y no puede firmar.'
    },
  'Accept on the phone, then compare the policy and first address before funding.': {
    fr: 'Acceptez sur le téléphone, puis comparez la politique et la première adresse avant de déposer des fonds.',
    es: 'Acepta en el teléfono y, después, compara la política y la primera dirección antes de depositar fondos.'
  },
  'One phone, one invitation': {
    fr: 'Un téléphone, une invitation',
    es: 'Un teléfono, una invitación'
  },
  'Pairing comparison code': {
    fr: 'Code de comparaison du jumelage',
    es: 'Código de comparación de vinculación'
  },
  'Pairing invitation in progress': {
    fr: 'Invitation de jumelage en cours',
    es: 'Invitación de vinculación en curso'
  },
  'Pairing progress': { fr: 'Progression du jumelage', es: 'Progreso de vinculación' },
  'Pairing progress could not be saved.': {
    fr: 'La progression du jumelage n’a pas pu être enregistrée.',
    es: 'No se pudo guardar el progreso de vinculación.'
  },
  'Pairing resumed': { fr: 'Jumelage repris', es: 'Vinculación reanudada' },
  'Pending pairing cancelled. Scan a new invitation to restart.': {
    fr: 'Jumelage en attente annulé. Scannez une nouvelle invitation pour recommencer.',
    es: 'Vinculación pendiente cancelada. Escanea una nueva invitación para volver a empezar.'
  },
  'Pending pairing cancelled': {
    fr: 'Jumelage en attente annulé',
    es: 'Vinculación pendiente cancelada'
  },
  'Pending session': { fr: 'Session en attente', es: 'Sesión pendiente' },
  'Accept wallet policy': {
    fr: 'Accepter la politique du portefeuille',
    es: 'Aceptar la política de la cartera'
  },
  'Phone accepted the wallet': {
    fr: 'Le téléphone a accepté le portefeuille',
    es: 'El teléfono aceptó la cartera'
  },
  'Phone name': { fr: 'Nom du téléphone', es: 'Nombre del teléfono' },
  'Phone key': { fr: 'Clé téléphone', es: 'Clave del teléfono' },
  'Phone signer setup is waiting to finish': {
    fr: 'La configuration du signataire du téléphone doit être terminée',
    es: 'La configuración del firmante del teléfono está pendiente de finalizar'
  },
  'PHONE SIGNER': { fr: 'SIGNATAIRE TÉLÉPHONE', es: 'FIRMANTE DEL TELÉFONO' },
  'Phone signer added': { fr: 'Signataire téléphone ajouté', es: 'Firmante del teléfono añadido' },
  'Point the camera at the encrypted phone response': {
    fr: 'Pointez la caméra vers la réponse chiffrée du téléphone',
    es: 'Apunta la cámara a la respuesta cifrada del teléfono'
  },
  'Point the camera at the final Groot wallet QR': {
    fr: 'Pointez la caméra vers le QR final du portefeuille Groot',
    es: 'Apunta la cámara al QR final de la cartera Groot'
  },
  'Point the camera at the Groot desktop invitation': {
    fr: 'Pointez la caméra vers l’invitation de Groot sur ordinateur',
    es: 'Apunta la cámara a la invitación de Groot para ordenador'
  },
  'Point the camera at the Groot watch-only wallet QR': {
    fr: 'Pointez la caméra vers le QR Groot du portefeuille en lecture seule',
    es: 'Apunta la cámara al QR de la cartera Groot de solo lectura'
  },
  'PSBT signed on this phone': {
    fr: 'PSBT signée sur ce téléphone',
    es: 'PSBT firmada en este teléfono'
  },
  'Finish pairing on the phone': {
    fr: 'Terminer le jumelage sur le téléphone',
    es: 'Completar la vinculación en el teléfono'
  },
  'Resume pairing': { fr: 'Reprendre le jumelage', es: 'Reanudar vinculación' },
  'Phone key saved': { fr: 'Clé du téléphone enregistrée', es: 'Clave del teléfono guardada' },
  'Use this phone as a signer.': {
    fr: 'Utilisez ce téléphone pour signer.',
    es: 'Usa este teléfono para firmar.'
  },
  'Scan this QR on desktop': {
    fr: 'Scannez ce QR sur l’ordinateur',
    es: 'Escanea este QR en el ordenador'
  },
  'Tap the QR to enlarge it.': {
    fr: 'Touchez le QR pour l’agrandir.',
    es: 'Toca el QR para ampliarlo.'
  },
  'Scan the QR for this pairing.': {
    fr: 'Scannez le QR de ce jumelage.',
    es: 'Escanea el QR de esta vinculación.'
  },
  'Enter the pairing PIN once. Groot does not retain it after the app restarts.': {
    fr: 'Saisissez une fois le PIN du jumelage. Groot ne le conserve pas après le redémarrage de l’application.',
    es: 'Introduce una vez el PIN de vinculación. Groot no lo conserva después de reiniciar la aplicación.'
  },
  'Resume wallet pairing': {
    fr: 'Reprendre le jumelage du portefeuille',
    es: 'Reanudar la vinculación de la cartera'
  },
  'Wallet pairing in progress': {
    fr: 'Jumelage du portefeuille en cours',
    es: 'Vinculación de cartera en curso'
  },
  'Scan phone QR code': {
    fr: 'Scanner le code QR du téléphone',
    es: 'Escanear el código QR del teléfono'
  },
  'Scan public wallet QR': {
    fr: 'Scanner le QR public du portefeuille',
    es: 'Escanear QR público de la cartera'
  },
  'Scan the desktop invitation': {
    fr: 'Scanner l’invitation de l’ordinateur',
    es: 'Escanear invitación del ordenador'
  },
  'Scan the final wallet policy': {
    fr: 'Scanner la politique finale du portefeuille',
    es: 'Escanear política final de la cartera'
  },
  'Finish wallet setup on desktop': {
    fr: 'Terminer la configuration sur l’ordinateur',
    es: 'Terminar la configuración en el ordenador'
  },
  'Desktop is finishing setup. It will show one final wallet QR next. Keep this screen ready to scan it.':
    {
      fr: 'L’ordinateur termine la configuration. Il affichera ensuite un dernier QR du portefeuille. Gardez cet écran prêt à le scanner.',
      es: 'El ordenador está terminando la configuración. A continuación mostrará un último QR de la cartera. Mantén esta pantalla lista para escanearlo.'
    },
  'Turn up screen brightness, hold the phone steady, or tap the QR to enlarge it.': {
    fr: 'Augmentez la luminosité, maintenez le téléphone immobile ou touchez le QR pour l’agrandir.',
    es: 'Aumenta el brillo, mantén el teléfono quieto o toca el QR para ampliarlo.'
  },
  'Phone key added': {
    fr: 'Clé du téléphone ajoutée',
    es: 'Clave del teléfono añadida'
  },
  'Finish setting up the wallet to get the final QR.': {
    fr: 'Terminez la configuration du portefeuille pour obtenir le QR final.',
    es: 'Termina de configurar la cartera para obtener el QR final.'
  },
  'Continue wallet setup': {
    fr: 'Continuer la configuration',
    es: 'Continuar configuración'
  },
  'Continue on desktop. The phone waits for the completed wallet policy.': {
    fr: 'Continuez sur l’ordinateur. Le téléphone attend la politique complète du portefeuille.',
    es: 'Continúa en el ordenador. El teléfono espera la política completa de la cartera.'
  },
  'Enlarge {label}': {
    fr: 'Agrandir {label}',
    es: 'Ampliar {label}'
  },
  'Enlarged {label}': {
    fr: '{label} agrandi',
    es: '{label} ampliado'
  },
  'Close enlarged QR': {
    fr: 'Fermer le QR agrandi',
    es: 'Cerrar QR ampliado'
  },
  'Scan the public descriptor from desktop. No hardware seed, signing key, or Groot account is transferred.':
    {
      fr: 'Scannez le descripteur public depuis l’ordinateur. Aucune graine matérielle, clé de signature ni compte Groot n’est transféré.',
      es: 'Escanea el descriptor público del ordenador. No se transfiere ninguna semilla física, clave de firma ni cuenta Groot.'
    },
  'Shared wallet · this desktop coordinates the policy and hardware signers.': {
    fr: 'Portefeuille partagé · cet ordinateur coordonne la politique et les signataires matériels.',
    es: 'Cartera compartida · este ordenador coordina la política y los firmantes físicos.'
  },
  'Shared wallet · this phone holds one software signer and can sign reviewed desktop PSBTs.': {
    fr: 'Portefeuille partagé · ce téléphone détient un signataire logiciel et peut signer les PSBT vérifiées sur l’ordinateur.',
    es: 'Cartera compartida · este teléfono guarda un firmante de software y puede firmar PSBT revisadas en el ordenador.'
  },
  'Shared wallet paired': { fr: 'Portefeuille partagé jumelé', es: 'Cartera compartida vinculada' },
  'Scan the QR code shown on desktop.': {
    fr: 'Scannez le code QR affiché sur l’ordinateur.',
    es: 'Escanea el código QR que aparece en el ordenador.'
  },
  'Sign payment': { fr: 'Signer le paiement', es: 'Firmar el pago' },
  'Sign another PSBT': { fr: 'Signer une autre PSBT', es: 'Firmar otra PSBT' },
  'Sign desktop PSBT': { fr: 'Signer la PSBT de l’ordinateur', es: 'Firmar PSBT del ordenador' },
  'Sign this exact PSBT': { fr: 'Signer exactement cette PSBT', es: 'Firmar esta PSBT exacta' },
  'Signature ready': { fr: 'Signature prête', es: 'Firma lista' },
  'Signed crypto-psbt QR': { fr: 'QR crypto-psbt signé', es: 'QR crypto-psbt firmado' },
  'The 24 words derive this BIP48 key with no BIP39 passphrase. Your app PIN only unlocks the encrypted copy on this phone.':
    {
      fr: 'Les 24 mots dérivent cette clé BIP48 sans phrase secrète BIP39. Le PIN de l’application déverrouille uniquement la copie chiffrée sur ce téléphone.',
      es: 'Las 24 palabras derivan esta clave BIP48 sin frase de contraseña BIP39. El PIN de la aplicación solo desbloquea la copia cifrada en este teléfono.'
    },
  'The account xpub is encrypted and signed for this invitation.': {
    fr: 'La xpub du compte est chiffrée et signée pour cette invitation.',
    es: 'La xpub de la cuenta está cifrada y firmada para esta invitación.'
  },
  'The invitation expires in 15 minutes and can add one phone.': {
    fr: 'L’invitation expire dans 15 minutes et permet d’ajouter un téléphone.',
    es: 'La invitación caduca en 15 minutos y permite añadir un teléfono.'
  },
  'The same invitation-bound response is ready for desktop.': {
    fr: 'La même réponse liée à l’invitation est prête pour l’ordinateur.',
    es: 'La misma respuesta vinculada a la invitación está lista para el ordenador.'
  },
  'The staged phone key was removed.': {
    fr: 'La clé de téléphone préparée a été supprimée.',
    es: 'Se eliminó la clave de teléfono preparada.'
  },
  'Enter the same local PIN to restore the exact response QR. No key leaves this phone.': {
    fr: 'Saisissez le même PIN local pour restaurer exactement le QR de réponse. Aucune clé ne quitte ce téléphone.',
    es: 'Introduce el mismo PIN local para restaurar exactamente el QR de respuesta. Ninguna clave sale de este teléfono.'
  },
  'The phone creates one BIP48 signer. Its 24 words use no BIP39 passphrase.': {
    fr: 'Le téléphone crée un signataire BIP48. Ses 24 mots n’utilisent aucune phrase secrète BIP39.',
    es: 'El teléfono crea un firmante BIP48. Sus 24 palabras no usan frase de contraseña BIP39.'
  },
  'This copy derives receive and change addresses and reveals wallet activity. Spending still requires the hardware signer.':
    {
      fr: 'Cette copie dérive les adresses de réception et de monnaie et révèle l’activité du portefeuille. Dépenser exige toujours le signataire matériel.',
      es: 'Esta copia deriva direcciones de recepción y cambio y revela la actividad. Gastar aún requiere el firmante físico.'
    },
  'This phone can monitor addresses but has no signing key.': {
    fr: 'Ce téléphone peut surveiller les adresses mais ne possède aucune clé de signature.',
    es: 'Este teléfono puede vigilar direcciones, pero no tiene clave de firma.'
  },
  'This phone holds one signer; desktop remains the coordinator.': {
    fr: 'Ce téléphone détient un signataire ; l’ordinateur reste le coordinateur.',
    es: 'Este teléfono guarda un firmante; el ordenador sigue siendo el coordinador.'
  },
  'Scan this QR in Groot on your phone.': {
    fr: 'Scannez ce QR dans Groot sur votre téléphone.',
    es: 'Escanea este QR en Groot en tu teléfono.'
  },
  'Transaction verified': { fr: 'Transaction vérifiée', es: 'Transacción verificada' },
  'Verified wallet change': {
    fr: 'Monnaie du portefeuille vérifiée',
    es: 'Cambio de cartera verificado'
  },
  'Verify before funding': { fr: 'Vérifier avant de financer', es: 'Verificar antes de depositar' },
  'Watch desktop wallet': {
    fr: 'Surveiller le portefeuille de l’ordinateur',
    es: 'Ver cartera del ordenador'
  },
  'Watch-only': { fr: 'Lecture seule', es: 'Solo lectura' },
  'WATCH-ONLY': { fr: 'LECTURE SEULE', es: 'SOLO LECTURA' },
  'Watch-only wallet imported': {
    fr: 'Portefeuille en lecture seule importé',
    es: 'Cartera de solo lectura importada'
  },
  'Watch-only wallet QR': {
    fr: 'QR du portefeuille en lecture seule',
    es: 'QR de cartera de solo lectura'
  },
  'Words-only recovery': {
    fr: 'Récupération avec les mots uniquement',
    es: 'Recuperación solo con palabras'
  },
  'Write down all 24 words. The PIN unlocks this phone only.': {
    fr: 'Notez les 24 mots. Le PIN déverrouille uniquement ce téléphone.',
    es: 'Anota las 24 palabras. El PIN solo desbloquea este teléfono.'
  },
  'Back to wallets': { fr: 'Retour aux portefeuilles', es: 'Volver a las carteras' },
  'Enter 24 words and restore': {
    fr: 'Saisir les 24 mots et restaurer',
    es: 'Introducir las 24 palabras y restaurar'
  },
  'Exact match required': {
    fr: 'Correspondance exacte requise',
    es: 'Se requiere una coincidencia exacta'
  },
  'Groot restores only if the words reproduce this signer and the complete wallet policy.': {
    fr: 'Groot restaure uniquement si les mots reproduisent ce signataire et la politique complète du portefeuille.',
    es: 'Groot solo restaura si las palabras reproducen este firmante y la política completa de la cartera.'
  },
  'New local app PIN': {
    fr: 'Nouveau PIN local de l’application',
    es: 'Nuevo PIN local de la aplicación'
  },
  'On desktop, open the shared wallet menu and choose Restore Groot phone.': {
    fr: 'Sur l’ordinateur, ouvrez le menu du portefeuille partagé et choisissez Restaurer le téléphone Groot.',
    es: 'En el ordenador, abre el menú de la cartera compartida y elige Restaurar teléfono Groot.'
  },
  'Phone signer restored': {
    fr: 'Signataire du téléphone restauré',
    es: 'Firmante del teléfono restaurado'
  },
  'Point the camera at the desktop recovery QR': {
    fr: 'Pointez la caméra vers le QR de récupération de l’ordinateur',
    es: 'Apunta la cámara al QR de recuperación del ordenador'
  },
  'Rebuild the phone signer from its 24 words': {
    fr: 'Reconstruire le signataire du téléphone avec ses 24 mots',
    es: 'Reconstruir el firmante del teléfono con sus 24 palabras'
  },
  'Recover a shared wallet from desktop and its 24 words.': {
    fr: 'Récupérez un portefeuille partagé depuis l’ordinateur et ses 24 mots.',
    es: 'Recupera una cartera compartida desde el ordenador y sus 24 palabras.'
  },
  'Recovery QR unavailable': {
    fr: 'QR de récupération indisponible',
    es: 'QR de recuperación no disponible'
  },
  'Replacement phone': { fr: 'Téléphone de remplacement', es: 'Teléfono de reemplazo' },
  'Replacement phone wallet record': {
    fr: 'Enregistrement du portefeuille pour le téléphone de remplacement',
    es: 'Registro de cartera para el teléfono de reemplazo'
  },
  'Restore a Groot phone': {
    fr: 'Restaurer un téléphone Groot',
    es: 'Restaurar un teléfono Groot'
  },
  'Restore a shared wallet': {
    fr: 'Restaurer un portefeuille partagé',
    es: 'Restaurar una cartera compartida'
  },
  'Restore Groot phone': {
    fr: 'Restaurer le téléphone Groot',
    es: 'Restaurar teléfono Groot'
  },
  'Restore phone signer': {
    fr: 'Restaurer le signataire du téléphone',
    es: 'Restaurar firmante del teléfono'
  },
  'Scan desktop recovery QR': {
    fr: 'Scanner le QR de récupération de l’ordinateur',
    es: 'Escanear QR de recuperación del ordenador'
  },
  'Scan the recovery QR from desktop, then enter this phone signer’s original 24 words.': {
    fr: 'Scannez le QR de récupération de l’ordinateur, puis saisissez les 24 mots d’origine de ce signataire.',
    es: 'Escanea el QR de recuperación del ordenador y después introduce las 24 palabras originales de este firmante.'
  },
  'Scan this public wallet record on the replacement phone, then enter the original 24 words there.':
    {
      fr: 'Scannez cet enregistrement public sur le téléphone de remplacement, puis saisissez-y les 24 mots d’origine.',
      es: 'Escanea este registro público en el teléfono de reemplazo y después introduce allí las 24 palabras originales.'
    },
  'This QR cannot spend, but it reveals wallet addresses. The phone accepts it only when the words reproduce the exact signer and policy.':
    {
      fr: 'Ce QR ne peut pas dépenser, mais il révèle les adresses du portefeuille. Le téléphone l’accepte uniquement si les mots reproduisent exactement le signataire et la politique.',
      es: 'Este QR no puede gastar, pero revela las direcciones de la cartera. El teléfono solo lo acepta si las palabras reproducen exactamente el firmante y la política.'
    },
  'Verifying recovery…': {
    fr: 'Vérification de la récupération…',
    es: 'Verificando recuperación…'
  },
  'Words stay on the phone': {
    fr: 'Les mots restent sur le téléphone',
    es: 'Las palabras permanecen en el teléfono'
  },
  '{wallet} matched the words and exact desktop policy.': {
    fr: '{wallet} correspond aux mots et à la politique exacte de l’ordinateur.',
    es: '{wallet} coincide con las palabras y la política exacta del ordenador.'
  },
  '{count} inputs': { fr: '{count} entrées', es: '{count} entradas' }
} as const satisfies CatalogSection;

import type { CatalogSection } from './types';

export const sendCopy = {
  'Self-transfer': { fr: 'Transfert interne', es: 'Transferencia interna' },
  Consolidating: { fr: 'Consolidation', es: 'Consolidación' },
  'Self-transfer recipient': {
    fr: 'Destinataire interne',
    es: 'Destinatario interno'
  },
  'This recipient belongs to this wallet. The network fee is the only amount leaving the wallet.': {
    fr: 'Ce destinataire appartient à ce portefeuille. Seuls les frais de réseau quittent le portefeuille.',
    es: 'Este destinatario pertenece a esta cartera. Solo la comisión de red sale de la cartera.'
  },
  'Total staying within this wallet. Compare this amount with the hardware signer.': {
    fr: 'Total restant dans ce portefeuille. Comparez ce montant avec le signataire matériel.',
    es: 'Total que permanece en esta cartera. Compara este importe con el firmante físico.'
  },
  'Receive path': { fr: 'Chemin de réception', es: 'Ruta de recepción' },
  'Receive paths': { fr: 'Chemins de réception', es: 'Rutas de recepción' },
  'Your session expired. Unlock this wallet before using a hardware signer.': {
    fr: "Votre session a expiré. Déverrouillez ce portefeuille avant d'utiliser un signataire matériel.",
    es: 'Tu sesión ha caducado. Desbloquea esta cartera antes de usar un firmante físico.'
  },
  'Renew protection': { fr: 'Renouveler la protection', es: 'Renovar protección' },
  'Move this coin within your wallet to restart its protection.': {
    fr: 'Déplacez cette pièce dans votre portefeuille pour redémarrer sa protection.',
    es: 'Mueve esta moneda dentro de tu cartera para reiniciar su protección.'
  },
  'Review the renewal, then approve it with your usual keys.': {
    fr: 'Vérifiez le renouvellement, puis approuvez-le avec vos clés habituelles.',
    es: 'Revisa la renovación y apruébala con tus claves habituales.'
  },
  'Lock the extra key again': {
    fr: 'Reverrouiller la clé supplémentaire',
    es: 'Volver a bloquear la clave adicional'
  },
  'Only this coin moves. Its protection restarts after the new coin confirms.': {
    fr: 'Seule cette pièce est déplacée. Sa protection redémarre après confirmation de la nouvelle pièce.',
    es: 'Solo se mueve esta moneda. Su protección se reinicia cuando se confirma la nueva moneda.'
  },
  'How it works': { fr: 'Comment cela fonctionne', es: 'Cómo funciona' },
  'Your usual 2-of-3 keys approve the move. The {key} is not used.': {
    fr: 'Vos clés habituelles 2 sur 3 approuvent le déplacement. La {key} n’est pas utilisée.',
    es: 'Tus claves habituales 2 de 3 aprueban el movimiento. La {key} no se utiliza.'
  },
  'After confirmation, the new coin gets a fresh {count}-block wait.': {
    fr: 'Après confirmation, la nouvelle pièce bénéficie d’une nouvelle attente de {count} blocs.',
    es: 'Tras la confirmación, la nueva moneda recibe una nueva espera de {count} bloques.'
  },
  'The fee comes from this coin. No other coin is combined, but the move remains visible onchain.':
    {
      fr: 'Les frais proviennent de cette pièce. Aucune autre pièce n’est combinée, mais le déplacement reste visible sur la blockchain.',
      es: 'La comisión sale de esta moneda. No se combina ninguna otra moneda, pero el movimiento sigue visible en la cadena.'
    },
  'Protection renewal broadcast': {
    fr: 'Renouvellement de protection diffusé',
    es: 'Renovación de protección transmitida'
  },
  'COIN PROTECTION': { fr: 'PROTECTION DE LA PIÈCE', es: 'PROTECCIÓN DE LA MONEDA' },
  'Renew this coin’s protection': {
    fr: 'Renouveler la protection de cette pièce',
    es: 'Renovar la protección de esta moneda'
  },
  'Choose a label and fee. You will review everything before signing.': {
    fr: 'Choisissez un libellé et des frais. Vous vérifierez tout avant de signer.',
    es: 'Elige una etiqueta y una comisión. Revisarás todo antes de firmar.'
  },
  'Coin being renewed': { fr: 'Pièce renouvelée', es: 'Moneda que se renueva' },
  '{key} can spend now': {
    fr: '{key} peut dépenser maintenant',
    es: '{key} puede gastar ahora'
  },
  'Transaction label': {
    fr: 'Libellé de la transaction',
    es: 'Etiqueta de la transacción'
  },
  'e.g. Renew savings protection': {
    fr: 'p. ex. Renouveler la protection de l’épargne',
    es: 'p. ej. Renovar protección de ahorros'
  },
  'Protection renewal could not be prepared': {
    fr: 'Le renouvellement de protection n’a pas pu être préparé',
    es: 'No se pudo preparar la renovación de protección'
  },
  'Preparing renewal…': { fr: 'Préparation du renouvellement…', es: 'Preparando renovación…' },
  'Review protection renewal': {
    fr: 'Vérifier le renouvellement',
    es: 'Revisar renovación de protección'
  },
  'New protected coin': { fr: 'Nouvelle pièce protégée', es: 'Nueva moneda protegida' },
  'New wallet address': {
    fr: 'Nouvelle adresse du portefeuille',
    es: 'Nueva dirección de la cartera'
  },
  'Protection restarts after confirmation': {
    fr: 'La protection redémarre après confirmation',
    es: 'La protección se reinicia tras la confirmación'
  },
  'Only this coin moves. The network fee is the only amount leaving your wallet.': {
    fr: 'Seule cette pièce est déplacée. Les frais de réseau sont le seul montant qui quitte votre portefeuille.',
    es: 'Solo se mueve esta moneda. La comisión de red es la única cantidad que sale de tu cartera.'
  },
  'Protection renewal unavailable': {
    fr: 'Renouvellement de protection indisponible',
    es: 'Renovación de protección no disponible'
  },
  'Choose one coin whose recovery or heir key can already spend.': {
    fr: 'Choisissez une pièce que la clé de récupération ou d’héritier peut déjà dépenser.',
    es: 'Elige una moneda que la clave de recuperación o del heredero ya pueda gastar.'
  },
  'Sync the wallet before renewing protection.': {
    fr: 'Synchronisez le portefeuille avant de renouveler la protection.',
    es: 'Sincroniza la cartera antes de renovar la protección.'
  },
  'Payment already in progress': {
    fr: 'Paiement déjà en cours',
    es: 'Ya hay un pago en curso'
  },
  'Finish or cancel it before renewing another coin.': {
    fr: 'Terminez-le ou annulez-le avant de renouveler une autre pièce.',
    es: 'Termínalo o cancélalo antes de renovar otra moneda.'
  },
  'Automatic selection': { fr: 'Sélection automatique', es: 'Selección automática' },
  '{source} signer': { fr: 'Signataire {source}', es: 'Firmante {source}' },
  'Manual · {count} coin': { fr: 'Manuel · {count} pièce', es: 'Manual · {count} moneda' },
  'Manual · {count} coins': { fr: 'Manuel · {count} pièces', es: 'Manual · {count} monedas' },
  '{amount} {unit} available': {
    fr: '{amount} {unit} disponibles',
    es: '{amount} {unit} disponibles'
  },
  '{strategy} · Frozen coins stay untouched': {
    fr: '{strategy} · les pièces gelées restent intactes',
    es: '{strategy} · las monedas congeladas no se modifican'
  },
  frozen: { fr: 'gelés', es: 'congelados' },
  'Review frozen coins': {
    fr: 'Examiner les pièces gelées',
    es: 'Revisar monedas congeladas'
  },
  '{count} more signature required': {
    fr: 'Encore {count} signature requise',
    es: 'Se necesita {count} firma más'
  },
  '{count} more signatures required': {
    fr: 'Encore {count} signatures requises',
    es: 'Se necesitan {count} firmas más'
  },
  'External hardware signer': { fr: 'Signataire matériel externe', es: 'Firmante físico externo' },
  'Groot app': { fr: 'Application Groot', es: 'Aplicación Groot' },
  'Software signer · This device': {
    fr: 'Signataire logiciel · cet appareil',
    es: 'Firmante de software · este dispositivo'
  },
  Economy: { fr: 'Économie', es: 'Económica' },
  Standard: { fr: 'Standard', es: 'Estándar' },
  Priority: { fr: 'Priorité', es: 'Prioritaria' },
  'The signed transaction was saved to the selected file.': {
    fr: 'La transaction signée a été enregistrée dans le fichier sélectionné.',
    es: 'La transacción firmada se guardó en el archivo seleccionado.'
  },
  'The unsigned transaction was saved to the selected file.': {
    fr: 'La transaction non signée a été enregistrée dans le fichier sélectionné.',
    es: 'La transacción sin firmar se guardó en el archivo seleccionado.'
  },
  'Signed PSBT saved': { fr: 'PSBT signée enregistrée', es: 'PSBT firmada guardada' },
  '{signed} of {required} collected': {
    fr: '{signed} sur {required} collectées',
    es: '{signed} de {required} recopiladas'
  },
  'A fee-only child transaction with a': {
    fr: 'Une transaction enfant composée uniquement de frais avec un',
    es: 'Una transacción hija solo de comisión con un'
  },
  address: { fr: 'adresse', es: 'dirección' },
  Amount: { fr: 'Montant', es: 'Importe' },
  'Any PSBT copy already exported or shared may still contain it and remain broadcastable.': {
    fr: 'Toute copie de la PSBT déjà exportée ou partagée peut encore la contenir et rester diffusable.',
    es: 'Cualquier copia de la PSBT ya exportada o compartida puede seguir conteniéndola y ser difundible.'
  },
  'Any PSBT copy already exported or shared may still contain it and can remain broadcastable if it has enough signatures.':
    {
      fr: 'Toute copie de la PSBT déjà exportée ou partagée peut encore la contenir et rester diffusable si elle possède assez de signatures.',
      es: 'Cualquier copia de la PSBT ya exportada o compartida puede seguir conteniéndola y ser difundible si tiene suficientes firmas.'
    },
  'Authorize payment': { fr: 'Autoriser le paiement', es: 'Autorizar pago' },
  'Automatic strategy': { fr: 'Stratégie automatique', es: 'Estrategia automática' },
  'Available:': { fr: 'Disponible :', es: 'Disponible:' },
  'Back to review': { fr: 'Retour à la vérification', es: 'Volver a la revisión' },
  'Balance refresh is pending; sync when the node is available.': {
    fr: 'L’actualisation du solde est en attente ; synchronisez lorsque le nœud est disponible.',
    es: 'La actualización del saldo está pendiente; sincroniza cuando el nodo esté disponible.'
  },
  'Bitcoin address': { fr: 'Adresse Bitcoin', es: 'Dirección de Bitcoin' },
  'Bitcoin Core has no usable estimate. Groot will not invent one; choose the sat/vB rate you want to review.':
    {
      fr: 'Bitcoin Core ne fournit aucune estimation utilisable. Groot n’en inventera pas ; choisissez le taux en sat/vB que vous souhaitez vérifier.',
      es: 'Bitcoin Core no tiene una estimación utilizable. Groot no inventará una; elige la tasa en sat/vB que quieras revisar.'
    },
  'Bitcoin Core has no usable estimate. Groot will not invent one; choose the sat/vB rate every signer will review.':
    {
      fr: 'Bitcoin Core ne fournit aucune estimation utilisable. Groot n’en inventera pas ; choisissez le taux en sat/vB que chaque signataire vérifiera.',
      es: 'Bitcoin Core no tiene una estimación utilizable. Groot no inventará una; elige la tasa en sat/vB que revisará cada firmante.'
    },
  'Bitcoin transactions cannot be reversed. Verify the address and amount before signing.': {
    fr: 'Les transactions Bitcoin sont irréversibles. Vérifiez l’adresse et le montant avant de signer.',
    es: 'Las transacciones de Bitcoin no se pueden revertir. Verifica la dirección y el importe antes de firmar.'
  },
  'Cancel payment': { fr: 'Annuler le paiement', es: 'Cancelar pago' },
  'Choose signed PSBT': { fr: 'Choisir une PSBT signée', es: 'Elegir PSBT firmada' },
  'Choose PSBT file': { fr: 'Choisir un fichier PSBT', es: 'Elegir archivo PSBT' },
  'Coin selection': { fr: 'Sélection des pièces', es: 'Selección de monedas' },
  collected: { fr: 'recueillies', es: 'recopiladas' },
  'Coldcard must know this wallet policy': {
    fr: 'Coldcard doit connaître cette politique de portefeuille',
    es: 'Coldcard debe conocer esta política de cartera'
  },
  'Connect an HWI-compatible device, or use signed PSBT import.': {
    fr: 'Connectez un appareil compatible HWI ou importez une PSBT signée.',
    es: 'Conecta un dispositivo compatible con HWI o importa una PSBT firmada.'
  },
  'Continue to amount': { fr: 'Continuer vers le montant', es: 'Continuar al importe' },
  'Continue to sign': { fr: 'Continuer vers la signature', es: 'Continuar a la firma' },
  'Copy PSBT': { fr: 'Copier la PSBT', es: 'Copiar PSBT' },
  'Custom fee rate': { fr: 'Taux de frais personnalisé', es: 'Tasa de comisión personalizada' },
  'Device still showing the wallet policy?': {
    fr: 'L’appareil affiche toujours la politique du portefeuille ?',
    es: '¿El dispositivo sigue mostrando la política de la cartera?'
  },
  'Discard local signature': { fr: 'Écarter la signature locale', es: 'Descartar firma local' },
  'Enter a custom fee rate': {
    fr: 'Saisissez un taux de frais personnalisé',
    es: 'Introduce una tasa de comisión personalizada'
  },
  'Enter a valid': { fr: 'Saisissez une valeur valide de', es: 'Introduce un valor válido de' },
  'Enter this wallet’s Groot app PIN to broadcast this exact signed transaction.': {
    fr: 'Saisissez le code PIN Groot de ce portefeuille pour diffuser cette transaction signée exacte.',
    es: 'Introduce el PIN de Groot de esta cartera para difundir esta transacción firmada exacta.'
  },
  'Enter your wallet passphrase to unlock the signing keys. It never leaves this device.': {
    fr: 'Saisissez la phrase secrète du portefeuille pour déverrouiller les clés de signature. Elle ne quitte jamais cet appareil.',
    es: 'Introduce la frase de contraseña de la cartera para desbloquear las claves de firma. Nunca sale de este dispositivo.'
  },
  'Enter the coordinator app PIN. Hardware signatures are already inside the PSBT.': {
    fr: 'Saisissez le code PIN de l’application du coordinateur. Les signatures matérielles sont déjà dans la PSBT.',
    es: 'Introduce el PIN de la aplicación del coordinador. Las firmas de los dispositivos ya están dentro de la PSBT.'
  },
  'Estimated input weight:': {
    fr: 'Poids estimé des entrées :',
    es: 'Peso estimado de las entradas:'
  },
  'Exact strategy comparison': {
    fr: 'Comparaison exacte des stratégies',
    es: 'Comparación exacta de estrategias'
  },
  'FEE ACCELERATION': { fr: 'ACCÉLÉRATION DES FRAIS', es: 'ACELERACIÓN DE COMISIÓN' },
  'Finalize & broadcast': { fr: 'Finaliser et diffuser', es: 'Finalizar y difundir' },
  'Fund the payment': { fr: 'Financer le paiement', es: 'Financiar el pago' },
  'funding coin': { fr: 'pièce de financement', es: 'moneda de financiación' },
  'Funding labels': { fr: 'Libellés de financement', es: 'Etiquetas de financiación' },
  'Funding provenance hidden in discreet mode.': {
    fr: 'Provenance du financement masquée en mode discret.',
    es: 'Procedencia de la financiación oculta en modo discreto.'
  },
  'Hardware signing failed': {
    fr: 'Échec de la signature matérielle',
    es: 'Error de firma del dispositivo'
  },
  'If it reports an unknown multisig wallet, import this public descriptor from Settings → Multisig Wallets → Import.':
    {
      fr: 'S’il signale un portefeuille multisignature inconnu, importez ce descripteur public depuis Réglages → Portefeuilles multisignatures → Importer.',
      es: 'Si informa de una cartera multifirma desconocida, importa este descriptor público desde Ajustes → Carteras multifirma → Importar.'
    },
  'Import signed PSBT': { fr: 'Importer une PSBT signée', es: 'Importar PSBT firmada' },
  'Input details': { fr: 'Détails des entrées', es: 'Detalles de las entradas' },
  'Keep payment': { fr: 'Conserver le paiement', es: 'Conservar pago' },
  'Keep signature': { fr: 'Conserver la signature', es: 'Conservar firma' },
  'Keep signing': { fr: 'Continuer à signer', es: 'Seguir firmando' },
  'Leave to overview': { fr: 'Quitter vers l’aperçu', es: 'Salir al resumen' },
  'Make another payment': { fr: 'Effectuer un autre paiement', es: 'Hacer otro pago' },
  Max: { fr: 'Max.', es: 'Máx.' },
  Network: { fr: 'Réseau', es: 'Red' },
  'network fee was broadcast.': {
    fr: 'de frais réseau a été diffusée.',
    es: 'de comisión de red se difundió.'
  },
  'network.': { fr: 'réseau.', es: 'red.' },
  'of 1 → 0 of 1': { fr: 'sur 1 → 0 sur 1', es: 'de 1 → 0 de 1' },
  'One existing group can fund this payment without linking these groups.': {
    fr: 'Un groupe existant peut financer ce paiement sans relier ces groupes.',
    es: 'Un grupo existente puede financiar este pago sin vincular estos grupos.'
  },
  Payment: { fr: 'Paiement', es: 'Pago' },
  'Payment action failed': {
    fr: 'Échec de l’action de paiement',
    es: 'Error en la acción de pago'
  },
  'Payment could not be prepared': {
    fr: 'Le paiement n’a pas pu être préparé',
    es: 'No se pudo preparar el pago'
  },
  'Payment label': { fr: 'Libellé du paiement', es: 'Etiqueta del pago' },
  'payment was rebroadcast with a higher fee.': {
    fr: 'le paiement a été rediffusé avec des frais plus élevés.',
    es: 'el pago se volvió a difundir con una comisión mayor.'
  },
  'prefix. Rust supplied this alias only after proving it decodes to the identical Bitcoin output script.':
    {
      fr: '. Rust n’a fourni cet alias qu’après avoir prouvé qu’il correspond au même script de sortie Bitcoin.',
      es: '. Rust solo proporcionó este alias después de demostrar que corresponde al mismo script de salida de Bitcoin.'
    },
  'Privacy recommendation': {
    fr: 'Recommandation de confidentialité',
    es: 'Recomendación de privacidad'
  },
  'Ready to finalize': { fr: 'Prêt à finaliser', es: 'Listo para finalizar' },
  Recipient: { fr: 'Destinataire', es: 'Destinatario' },
  'Required · greater than 0 and at most 10,000 sat/vB': {
    fr: 'Requis · supérieur à 0 et au maximum 10 000 sat/vB',
    es: 'Obligatorio · mayor que 0 y como máximo 10.000 sat/vB'
  },
  'Enter a fee rate': {
    fr: 'Saisissez un taux de frais',
    es: 'Introduce una tasa de comisión'
  },
  'Not enough bitcoin to raise the fee. Receive more and wait for it to confirm, or wait for this transaction to confirm.':
    {
      fr: 'Pas assez de bitcoins pour augmenter les frais. Recevez-en davantage et attendez sa confirmation, ou attendez la confirmation de cette transaction.',
      es: 'No hay suficiente bitcoin para aumentar la comisión. Recibe más y espera a que se confirme, o espera a que se confirme esta transacción.'
    },
  Rescan: { fr: 'Rechercher à nouveau', es: 'Volver a buscar' },
  'Return to the saved policy reference without interrupting this signing request.': {
    fr: 'Revenez à la référence de politique enregistrée sans interrompre cette demande de signature.',
    es: 'Vuelve a la referencia de política guardada sin interrumpir esta solicitud de firma.'
  },
  'Return to wallet': { fr: 'Retour au portefeuille', es: 'Volver a la cartera' },
  'Review acceleration': { fr: 'Vérifier l’accélération', es: 'Revisar aceleración' },
  'Review payment': { fr: 'Vérifier le paiement', es: 'Revisar pago' },
  'Review signed transaction': {
    fr: 'Vérifier la transaction signée',
    es: 'Revisar transacción firmada'
  },
  'Save PSBT': { fr: 'Enregistrer la PSBT', es: 'Guardar PSBT' },
  'Save signed PSBT': { fr: 'Enregistrer la PSBT signée', es: 'Guardar PSBT firmada' },
  'Save unsigned PSBT': { fr: 'Enregistrer la PSBT non signée', es: 'Guardar PSBT sin firmar' },
  'Save wallet policy': {
    fr: 'Enregistrer la politique du portefeuille',
    es: 'Guardar política de la cartera'
  },
  'Scan signed QR': { fr: 'Scanner le QR signé', es: 'Escanear QR firmado' },
  'selected ·': { fr: 'sélectionnées ·', es: 'seleccionadas ·' },
  SEND: { fr: 'ENVOYER', es: 'ENVIAR' },
  'Send bitcoin': { fr: 'Envoyer du bitcoin', es: 'Enviar bitcoin' },
  'Set the amount, then keep automatic selection or choose specific coins.': {
    fr: 'Définissez le montant, puis conservez la sélection automatique ou choisissez des pièces précises.',
    es: 'Establece el importe y mantén la selección automática o elige monedas concretas.'
  },
  'Show unsigned QR': { fr: 'Afficher le QR non signé', es: 'Mostrar QR sin firmar' },
  'shows the Regtest output with a': {
    fr: 'affiche la sortie Regtest avec un préfixe',
    es: 'muestra la salida de Regtest con un prefijo'
  },
  'Sign & broadcast': { fr: 'Signer et diffuser', es: 'Firmar y difundir' },
  'Sign on your hardware': { fr: 'Signer sur votre appareil', es: 'Firmar en tu dispositivo' },
  'Sign with cable': { fr: 'Signer par câble', es: 'Firmar por cable' },
  'Sign with device': { fr: 'Signer avec l’appareil', es: 'Firmar con el dispositivo' },
  'Signature progress': { fr: 'Progression des signatures', es: 'Progreso de firmas' },
  'Signature verified': { fr: 'Signature vérifiée', es: 'Firma verificada' },
  'Signatures lost': { fr: 'Signatures perdues', es: 'Firmas perdidas' },
  'Signatures saved': { fr: 'Signatures conservées', es: 'Firmas guardadas' },
  'Signed PSBT': { fr: 'PSBT signée', es: 'PSBT firmada' },
  Signer: { fr: 'Signataire', es: 'Firmante' },
  'STEP 1': { fr: 'ÉTAPE 1', es: 'PASO 1' },
  'STEP 2': { fr: 'ÉTAPE 2', es: 'PASO 2' },
  'than the valid More private candidate. Lower fee is not better privacy.': {
    fr: 'que l’option valide Plus privé. Des frais plus faibles n’offrent pas une meilleure confidentialité.',
    es: 'que la opción válida Más privada. Una comisión menor no mejora la privacidad.'
  },
  The: { fr: 'Le', es: 'El' },
  'The hardware signature is verified. Review the transaction once more before broadcasting.': {
    fr: 'La signature matérielle est vérifiée. Vérifiez encore une fois la transaction avant de la diffuser.',
    es: 'La firma del dispositivo está verificada. Revisa la transacción una vez más antes de difundirla.'
  },
  'The signed transaction was accepted by the': {
    fr: 'La transaction signée a été acceptée par le',
    es: 'La transacción firmada fue aceptada por la'
  },
  'This cannot be undone.': {
    fr: 'Cette action est irréversible.',
    es: 'Esto no se puede deshacer.'
  },
  'This device could not sign': {
    fr: 'Cet appareil n’a pas pu signer',
    es: 'Este dispositivo no pudo firmar'
  },
  'This does not revoke the signature.': {
    fr: 'Cela ne révoque pas la signature.',
    es: 'Esto no revoca la firma.'
  },
  'Labels help you recognize the transaction later.': {
    fr: 'Les libellés vous aident à reconnaître la transaction plus tard.',
    es: 'Las etiquetas te ayudan a reconocer la transacción más adelante.'
  },
  'Labels help every signer recognize the transaction.': {
    fr: 'Les libellés aident chaque signataire à reconnaître la transaction.',
    es: 'Las etiquetas ayudan a cada firmante a reconocer la transacción.'
  },
  'This saved payment is no longer available.': {
    fr: 'Ce paiement sauvegardé n’est plus disponible.',
    es: 'Este pago guardado ya no está disponible.'
  },
  To: { fr: 'À', es: 'A' },
  Total: { fr: 'Total', es: 'Total' },
  'Transaction to verify': { fr: 'Transaction à vérifier', es: 'Transacción para verificar' },
  'Use automatic selection': {
    fr: 'Utiliser la sélection automatique',
    es: 'Usar selección automática'
  },
  'Use privacy-first selection': {
    fr: 'Utiliser la sélection axée sur la confidentialité',
    es: 'Usar selección orientada a la privacidad'
  },
  'Validate & merge': { fr: 'Valider et fusionner', es: 'Validar y combinar' },
  'Validate signature': { fr: 'Valider la signature', es: 'Validar firma' },
  'Verify the address, amount, and fee on the signer. Groot never receives its private key or hardware passphrase.':
    {
      fr: 'Vérifiez l’adresse, le montant et les frais sur le signataire. Groot ne reçoit jamais sa clé privée ni sa phrase secrète matérielle.',
      es: 'Verifica la dirección, el importe y la comisión en el firmante. Groot nunca recibe su clave privada ni su frase de contraseña.'
    },
  'View policy reference': {
    fr: 'Afficher la référence de politique',
    es: 'Ver referencia de política'
  },
  'View transaction': { fr: 'Afficher la transaction', es: 'Ver transacción' },
  'was broadcast to the Bitcoin network.': {
    fr: 'a été diffusée sur le réseau Bitcoin.',
    es: 'se difundió en la red Bitcoin.'
  },
  'What is this payment for?': { fr: 'À quoi sert ce paiement ?', es: '¿Para qué es este pago?' },
  'You can return to signing without rebuilding the transaction or losing collected signatures.': {
    fr: 'Vous pouvez reprendre la signature sans reconstruire la transaction ni perdre les signatures recueillies.',
    es: 'Puedes volver a la firma sin reconstruir la transacción ni perder las firmas recopiladas.'
  },
  'You send': { fr: 'Vous envoyez', es: 'Envías' },
  'You will need to prepare and sign this payment again.': {
    fr: 'Vous devrez préparer et signer à nouveau ce paiement.',
    es: 'Tendrás que preparar y firmar este pago de nuevo.'
  },
  'Default is a replacement-only fallback one sat/vB above the exact minimum; it is not a general fee estimate.':
    {
      fr: 'La valeur par défaut est un repli réservé au remplacement, un sat/vB au-dessus du minimum exact ; ce n’est pas une estimation générale des frais.',
      es: 'El valor predeterminado es una alternativa exclusiva para el reemplazo, un sat/vB por encima del mínimo exacto; no es una estimación general de comisión.'
    },
  'Default uses Bitcoin Core because it is above the safe replacement minimum.': {
    fr: 'La valeur par défaut utilise Bitcoin Core car elle dépasse le minimum de remplacement sûr.',
    es: 'El valor predeterminado usa Bitcoin Core porque supera el mínimo de reemplazo seguro.'
  },
  'Estimated replacement fee': {
    fr: 'Frais de remplacement estimés',
    es: 'Comisión de reemplazo estimada'
  },
  'Exact replacement minimum': {
    fr: 'Minimum de remplacement exact',
    es: 'Mínimo exacto de reemplazo'
  },
  'Groot checked this transaction and Bitcoin Core’s replacement policy. Edit the target before creating the replacement.':
    {
      fr: 'Groot a vérifié cette transaction et la politique de remplacement de Bitcoin Core. Modifiez la cible avant de créer le remplacement.',
      es: 'Groot comprobó esta transacción y la política de reemplazo de Bitcoin Core. Edita el objetivo antes de crear el reemplazo.'
    },
  'Incremental fee': { fr: 'Frais supplémentaires', es: 'Comisión incremental' },
  Minimum: { fr: 'Minimum', es: 'Mínimo' },
  'Minimum {rate} sat/vB · rounded up only to 0.004 sat/vB precision': {
    fr: 'Minimum {rate} sat/vB · arrondi supérieur uniquement à la précision de 0,004 sat/vB',
    es: 'Mínimo {rate} sat/vB · redondeo superior solo a precisión de 0,004 sat/vB'
  },
  'Original effective rate': { fr: 'Taux effectif initial', es: 'Tasa efectiva original' },
  'Replacement fee': { fr: 'Frais de remplacement', es: 'Comisión de reemplazo' },
  'Resulting effective rate': { fr: 'Taux effectif obtenu', es: 'Tasa efectiva resultante' },
  'Review replacement fee': {
    fr: 'Vérifier les frais de remplacement',
    es: 'Revisar comisión de reemplazo'
  },
  'sat/vB · rounded up only to 0.004 sat/vB precision': {
    fr: 'sat/vB · arrondi supérieur uniquement à la précision de 0,004 sat/vB',
    es: 'sat/vB · redondeo superior solo a precisión de 0,004 sat/vB'
  },
  'Selected target': { fr: 'Cible sélectionnée', es: 'Objetivo seleccionado' },
  'Whole-satoshi fee construction can make the resulting effective rate differ slightly from the selected target.':
    {
      fr: 'La construction des frais en satoshis entiers peut faire légèrement différer le taux effectif obtenu de la cible sélectionnée.',
      es: 'La construcción de la comisión en satoshis enteros puede hacer que la tasa efectiva resultante difiera ligeramente del objetivo seleccionado.'
    },
  'Your proposal will stay saved.': {
    fr: 'Votre proposition restera enregistrée.',
    es: 'Tu propuesta seguirá guardada.'
  },
  'Discard draft': {
    fr: 'Écarter le brouillon',
    es: 'Descartar borrador'
  },
  'Discard this payment draft?': {
    fr: 'Écarter ce brouillon de paiement ?',
    es: '¿Descartar este borrador de pago?'
  },
  'Discarding draft…': {
    fr: 'Suppression du brouillon…',
    es: 'Descartando borrador…'
  },
  'Keep draft': {
    fr: 'Conserver le brouillon',
    es: 'Conservar borrador'
  },
  'No transaction or signature exists yet.': {
    fr: 'Aucune transaction ni signature n’existe encore.',
    es: 'Aún no existe ninguna transacción ni firma.'
  },
  'Only the draft will be removed.': {
    fr: 'Seul le brouillon sera supprimé.',
    es: 'Solo se eliminará el borrador.'
  },
  'Payment draft discarded': {
    fr: 'Brouillon de paiement écarté',
    es: 'Borrador de pago descartado'
  },
  'Recipient, labels, amount, fee, and coin selection': {
    fr: 'Destinataire, libellés, montant, frais et sélection des pièces',
    es: 'Destinatario, etiquetas, importe, comisión y selección de monedas'
  },
  'Remove the unfinished payment without creating a transaction.': {
    fr: 'Supprimez le paiement inachevé sans créer de transaction.',
    es: 'Elimina el pago sin terminar sin crear una transacción.'
  },
  'Saved fields': {
    fr: 'Champs enregistrés',
    es: 'Campos guardados'
  },
  'The payment draft could not be discarded.': {
    fr: 'Le brouillon de paiement n’a pas pu être supprimé.',
    es: 'No se pudo descartar el borrador de pago.'
  },
  'The unfinished payment was removed. No transaction was created.': {
    fr: 'Le paiement inachevé a été supprimé. Aucune transaction n’a été créée.',
    es: 'Se eliminó el pago sin terminar. No se creó ninguna transacción.'
  },
  'Speed up transaction': {
    fr: 'Accélérer la transaction',
    es: 'Acelerar transacción'
  },
  'Confirm the additional fee. The payment amount and recipient stay the same.': {
    fr: 'Confirmez les frais supplémentaires. Le montant du paiement et le destinataire restent inchangés.',
    es: 'Confirma la comisión adicional. El importe del pago y el destinatario no cambian.'
  },
  'Confirm the additional fee, then continue to sign.': {
    fr: 'Confirmez les frais supplémentaires, puis continuez pour signer.',
    es: 'Confirma la comisión adicional y continúa para firmar.'
  },
  'You will spend this much more': {
    fr: 'Vous dépenserez ce montant en plus',
    es: 'Gastarás este importe adicional'
  },
  'Your payment amount and recipient will not change.': {
    fr: 'Le montant de votre paiement et le destinataire ne changeront pas.',
    es: 'El importe del pago y el destinatario no cambiarán.'
  },
  'This child fee helps the parent and child confirm together.': {
    fr: 'Ces frais de l’enfant aident le parent et l’enfant à être confirmés ensemble.',
    es: 'Esta comisión de la transacción hija ayuda a confirmar juntas ambas transacciones.'
  },
  'Change fee rate': {
    fr: 'Modifier le taux de frais',
    es: 'Cambiar tasa de comisión'
  },
  'View fee details': {
    fr: 'Afficher le détail des frais',
    es: 'Ver detalles de la comisión'
  },
  'Original fee rate': { fr: 'Taux de frais initial', es: 'Tasa de comisión original' },
  'Minimum fee rate': { fr: 'Taux de frais minimum', es: 'Tasa de comisión mínima' },
  'New fee rate': { fr: 'Nouveau taux de frais', es: 'Nueva tasa de comisión' },
  'Package fee rate': { fr: 'Taux de frais du paquet', es: 'Tasa de comisión del paquete' },
  'Parent fee rate': {
    fr: 'Taux de frais du parent',
    es: 'Tasa de comisión de la transacción madre'
  },
  'Minimum package rate': {
    fr: 'Taux minimum du paquet',
    es: 'Tasa mínima del paquete'
  },
  'Target package rate': { fr: 'Taux cible du paquet', es: 'Tasa objetivo del paquete' },
  'Child network fee': {
    fr: 'Frais réseau de l’enfant',
    es: 'Comisión de red de la transacción hija'
  },
  'Package network fee': { fr: 'Frais réseau du paquet', es: 'Comisión de red del paquete' },
  'Effective package rate': {
    fr: 'Taux effectif du paquet',
    es: 'Tasa efectiva del paquete'
  },
  'New network fee': { fr: 'Nouveaux frais de réseau', es: 'Nueva comisión de red' },
  'Additional fee': { fr: 'Frais supplémentaires', es: 'Comisión adicional' },
  'Effective fee rate': { fr: 'Taux de frais effectif', es: 'Tasa de comisión efectiva' },
  'Minimum {rate} sat/vB': {
    fr: 'Minimum {rate} sat/vB',
    es: 'Mínimo {rate} sat/vB'
  },
  'Speed-up cost': { fr: 'Coût de l’accélération', es: 'Coste de aceleración' },
  'The payment amount stays the same.': {
    fr: 'Le montant du paiement reste inchangé.',
    es: 'El importe del pago no cambia.'
  },
  'The child fee helps both transactions confirm together.': {
    fr: 'Les frais de l’enfant aident les deux transactions à être confirmées ensemble.',
    es: 'La comisión de la transacción hija ayuda a confirmar juntas ambas transacciones.'
  },
  'Transaction accelerated': {
    fr: 'Transaction accélérée',
    es: 'Transacción acelerada'
  },
  'Transaction accelerated.': {
    fr: 'Transaction accélérée.',
    es: 'Transacción acelerada.'
  },
  'The additional fee was accepted. Your payment is waiting for confirmation.': {
    fr: 'Les frais supplémentaires ont été acceptés. Votre paiement attend sa confirmation.',
    es: 'La comisión adicional fue aceptada. Tu pago está esperando confirmación.'
  },
  'The higher fee was accepted. Your payment amount and recipient stayed the same.': {
    fr: 'Les frais plus élevés ont été acceptés. Le montant du paiement et le destinataire sont restés inchangés.',
    es: 'La comisión más alta fue aceptada. El importe del pago y el destinatario no cambiaron.'
  },
  'Your payment was accepted by the Bitcoin network.': {
    fr: 'Votre paiement a été accepté par le réseau Bitcoin.',
    es: 'Tu pago fue aceptado por la red Bitcoin.'
  },
  'The system browser could not open the explorer.': {
    fr: 'Le navigateur du système n’a pas pu ouvrir l’explorateur.',
    es: 'El navegador del sistema no pudo abrir el explorador.'
  },
  'Scan Bitcoin payment QR': {
    fr: 'Scanner le QR de paiement Bitcoin',
    es: 'Escanear QR de pago de Bitcoin'
  },
  'Scan payment request': {
    fr: 'Scanner la demande de paiement',
    es: 'Escanear solicitud de pago'
  },
  'Scan a Bitcoin address or payment URI. You will review every imported detail before sending.': {
    fr: 'Scannez une adresse Bitcoin ou un URI de paiement. Vous vérifierez chaque détail importé avant l’envoi.',
    es: 'Escanea una dirección de Bitcoin o un URI de pago. Revisarás cada dato importado antes de enviar.'
  },
  'Point the camera at a Bitcoin payment QR': {
    fr: 'Pointez la caméra vers un QR de paiement Bitcoin',
    es: 'Apunta la cámara a un QR de pago de Bitcoin'
  },
  'Reading payment request…': {
    fr: 'Lecture de la demande de paiement…',
    es: 'Leyendo solicitud de pago…'
  },
  'Payment request scanned': {
    fr: 'Demande de paiement scannée',
    es: 'Solicitud de pago escaneada'
  },
  'QR code rejected': {
    fr: 'Code QR refusé',
    es: 'Código QR rechazado'
  }
} as const satisfies CatalogSection;

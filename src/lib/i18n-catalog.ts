import type { Locale } from './i18n';
import type { MessageValues, Translation, CatalogSection } from './locales/types';
import { settingsCopy } from './locales/settings';
import { onboardingCopy } from './locales/onboarding';
import { componentCopy } from './locales/components';
import { walletCopy } from './locales/wallet';
import { sendCopy } from './locales/send';
import { hardwareCopy } from './locales/hardware';
import { multisigCopy } from './locales/multisig';
import { accessibilityCopy } from './locales/accessibility';
import { attributeCopy } from './locales/attributes';
import { dynamicCopy } from './locales/dynamic';

export type { MessageValues, Translation, CatalogSection } from './locales/types';

// English source copy is the stable catalog key. Keeping the source beside both
// translations makes reviews able to compare meaning without chasing opaque IDs.
// User data and protocol identifiers must never be passed through this catalog.
export const copyCatalog = {
  ...settingsCopy,
  ...onboardingCopy,
  ...componentCopy,
  ...walletCopy,
  ...sendCopy,
  ...hardwareCopy,
  ...multisigCopy,
  ...accessibilityCopy,
  ...attributeCopy,
  ...dynamicCopy,
  Dismiss: { fr: 'Fermer', es: 'Cerrar' },
  Cancel: { fr: 'Annuler', es: 'Cancelar' },
  Back: { fr: 'Retour', es: 'Atrás' },
  Continue: { fr: 'Continuer', es: 'Continuar' },
  Close: { fr: 'Fermer', es: 'Cerrar' },
  Done: { fr: 'Terminé', es: 'Listo' },
  Save: { fr: 'Enregistrer', es: 'Guardar' },
  Delete: { fr: 'Supprimer', es: 'Eliminar' },
  Copy: { fr: 'Copier', es: 'Copiar' },
  Copied: { fr: 'Copié', es: 'Copiado' },
  'Try again': { fr: 'Réessayer', es: 'Intentar de nuevo' },
  'Loading…': { fr: 'Chargement…', es: 'Cargando…' },
  'Learn more': { fr: 'En savoir plus', es: 'Más información' },
  'View more details': { fr: 'Afficher plus de détails', es: 'Ver más detalles' },
  Unknown: { fr: 'Inconnu', es: 'Desconocido' },
  Unavailable: { fr: 'Indisponible', es: 'No disponible' },
  'Not available': { fr: 'Non disponible', es: 'No disponible' },
  Yes: { fr: 'Oui', es: 'Sí' },
  No: { fr: 'Non', es: 'No' },
  'Address copied': { fr: 'Adresse copiée', es: 'Dirección copiada' },
  'Address discarded': { fr: 'Adresse écartée', es: 'Dirección descartada' },
  'Address ready and copied': { fr: 'Adresse prête et copiée', es: 'Dirección lista y copiada' },
  'Address verified': { fr: 'Adresse vérifiée', es: 'Dirección verificada' },
  'Automatic lock updated': {
    fr: 'Verrouillage automatique mis à jour',
    es: 'Bloqueo automático actualizado'
  },
  'Backup file ready': {
    fr: 'Fichier de sauvegarde prêt',
    es: 'Archivo de copia de seguridad listo'
  },
  'Backup copied': { fr: 'Sauvegarde copiée', es: 'Copia de seguridad copiada' },
  'Backup not saved': { fr: 'Sauvegarde non enregistrée', es: 'Copia de seguridad no guardada' },
  'Backup saved': { fr: 'Sauvegarde enregistrée', es: 'Copia de seguridad guardada' },
  'Backup still unverified': {
    fr: 'Sauvegarde toujours non vérifiée',
    es: 'Copia de seguridad aún sin verificar'
  },
  'Balance and transactions refreshed.': {
    fr: 'Solde et transactions actualisés.',
    es: 'Saldo y transacciones actualizados.'
  },
  'Bitcoin node connected': { fr: 'Nœud Bitcoin connecté', es: 'Nodo de Bitcoin conectado' },
  'Bitcoin received': { fr: 'Bitcoin reçu', es: 'Bitcoin recibido' },
  'Coldcard policy not saved': {
    fr: 'Politique Coldcard non enregistrée',
    es: 'Política de Coldcard no guardada'
  },
  'Coldcard policy recorded': {
    fr: 'Politique Coldcard consignée',
    es: 'Política de Coldcard registrada'
  },
  'Coldcard policy saved': {
    fr: 'Politique Coldcard enregistrée',
    es: 'Política de Coldcard guardada'
  },
  'Continue with the transaction review on-device.': {
    fr: 'Poursuivez la vérification de la transaction sur l’appareil.',
    es: 'Continúa la revisión de la transacción en el dispositivo.'
  },
  'Reject or cancel the pending request on the device. Groot will close this dialog after the device responds.':
    {
      fr: 'Refusez ou annulez la demande en attente sur l’appareil. Groot fermera cette fenêtre après la réponse de l’appareil.',
      es: 'Rechaza o cancela la solicitud pendiente en el dispositivo. Groot cerrará esta ventana cuando responda el dispositivo.'
    },
  'Copy failed': { fr: 'Échec de la copie', es: 'Error al copiar' },
  'Could not delete wallet': {
    fr: 'Impossible de supprimer le portefeuille',
    es: 'No se pudo eliminar la cartera'
  },
  'Could not discard address': {
    fr: 'Impossible d’écarter l’adresse',
    es: 'No se pudo descartar la dirección'
  },
  'Could not generate QR code': {
    fr: 'Impossible de générer le code QR',
    es: 'No se pudo generar el código QR'
  },
  'Could not generate address': {
    fr: 'Impossible de générer l’adresse',
    es: 'No se pudo generar la dirección'
  },
  'Could not load addresses': {
    fr: 'Impossible de charger les adresses',
    es: 'No se pudieron cargar las direcciones'
  },
  'Could not load coins': {
    fr: 'Impossible de charger les pièces',
    es: 'No se pudieron cargar las monedas'
  },
  'Could not load transactions': {
    fr: 'Impossible de charger les transactions',
    es: 'No se pudieron cargar las transacciones'
  },
  'Could not load wallet': {
    fr: 'Impossible de charger le portefeuille',
    es: 'No se pudo cargar la cartera'
  },
  'Could not open wallet': {
    fr: 'Impossible d’ouvrir le portefeuille',
    es: 'No se pudo abrir la cartera'
  },
  'Could not prepare payment': {
    fr: 'Impossible de préparer le paiement',
    es: 'No se pudo preparar el pago'
  },
  'Could not read PSBT': { fr: 'Impossible de lire la PSBT', es: 'No se pudo leer la PSBT' },
  'Could not read PSBT file': {
    fr: 'Impossible de lire le fichier PSBT',
    es: 'No se pudo leer el archivo PSBT'
  },
  'Could not read backup': {
    fr: 'Impossible de lire la sauvegarde',
    es: 'No se pudo leer la copia de seguridad'
  },
  'Could not save PSBT': {
    fr: 'Impossible d’enregistrer la PSBT',
    es: 'No se pudo guardar la PSBT'
  },
  'Could not save payment draft': {
    fr: 'Impossible d’enregistrer le brouillon de paiement',
    es: 'No se pudo guardar el borrador de pago'
  },
  'Could not show saved PSBT': {
    fr: 'Impossible d’afficher la PSBT enregistrée',
    es: 'No se pudo mostrar la PSBT guardada'
  },
  'Could not show saved backup': {
    fr: 'Impossible d’afficher la sauvegarde enregistrée',
    es: 'No se pudo mostrar la copia de seguridad guardada'
  },
  'Could not show saved file': {
    fr: 'Impossible d’afficher le fichier enregistré',
    es: 'No se pudo mostrar el archivo guardado'
  },
  'Could not update automatic lock': {
    fr: 'Impossible de mettre à jour le verrouillage automatique',
    es: 'No se pudo actualizar el bloqueo automático'
  },
  'Could not update coins': {
    fr: 'Impossible de mettre à jour les pièces',
    es: 'No se pudieron actualizar las monedas'
  },
  'Descriptor backup not saved': {
    fr: 'Sauvegarde du descripteur non enregistrée',
    es: 'Copia del descriptor no guardada'
  },
  'Descriptor backup ready': {
    fr: 'Sauvegarde du descripteur prête',
    es: 'Copia del descriptor lista'
  },
  'Descriptor backup saved': {
    fr: 'Sauvegarde du descripteur enregistrée',
    es: 'Copia del descriptor guardada'
  },
  'Descriptors were restored. Run a full rescan before relying on the balance.': {
    fr: 'Les descripteurs ont été restaurés. Effectuez une analyse complète avant de vous fier au solde.',
    es: 'Los descriptores se restauraron. Ejecuta un escaneo completo antes de confiar en el saldo.'
  },
  'Fee estimates unavailable': {
    fr: 'Estimations de frais indisponibles',
    es: 'Estimaciones de comisión no disponibles'
  },
  'First address copied': { fr: 'Première adresse copiée', es: 'Primera dirección copiada' },
  'First confirmation': { fr: 'Première confirmation', es: 'Primera confirmación' },
  'Full rescan complete': { fr: 'Analyse complète terminée', es: 'Escaneo completo finalizado' },
  'Hardware signature added': {
    fr: 'Signature matérielle ajoutée',
    es: 'Firma del dispositivo añadida'
  },
  'Hardware signer name updated': {
    fr: 'Nom du signataire matériel mis à jour',
    es: 'Nombre del firmante físico actualizado'
  },
  'Hardware signer added': { fr: 'Signataire matériel ajouté', es: 'Firmante físico añadido' },
  'Hardware signer unlocked': {
    fr: 'Signataire matériel déverrouillé',
    es: 'Firmante físico desbloqueado'
  },
  'Health check needs attention': {
    fr: 'Le contrôle d’état requiert votre attention',
    es: 'La comprobación de estado requiere atención'
  },
  'Health-check status unavailable': {
    fr: 'État du contrôle indisponible',
    es: 'Estado de comprobación no disponible'
  },
  'Import and verify it on the Coldcard before signing.': {
    fr: 'Importez-la et vérifiez-la sur la Coldcard avant de signer.',
    es: 'Impórtala y verifícala en la Coldcard antes de firmar.'
  },
  'Import it on every Coldcard signer, then verify the policy on-device.': {
    fr: 'Importez-la sur chaque signataire Coldcard, puis vérifiez la politique sur l’appareil.',
    es: 'Impórtala en cada firmante Coldcard y verifica la política en el dispositivo.'
  },
  'Import it on the Coldcard and verify the policy details.': {
    fr: 'Importez-la sur la Coldcard et vérifiez les détails de la politique.',
    es: 'Impórtala en la Coldcard y verifica los detalles de la política.'
  },
  'It will not be offered for payment again.': {
    fr: 'Elle ne sera plus proposée pour recevoir un paiement.',
    es: 'No se volverá a ofrecer para recibir un pago.'
  },
  'Local coordinator data was removed. Your verified descriptor backup remains recoverable.': {
    fr: 'Les données locales du coordinateur ont été supprimées. Votre sauvegarde vérifiée du descripteur reste récupérable.',
    es: 'Se eliminaron los datos locales del coordinador. La copia verificada del descriptor sigue siendo recuperable.'
  },
  'Local signature discarded': { fr: 'Signature locale écartée', es: 'Firma local descartada' },
  'Local wallet data and encrypted key material were removed.': {
    fr: 'Les données locales du portefeuille et les clés chiffrées ont été supprimées.',
    es: 'Se eliminaron los datos locales de la cartera y el material de claves cifrado.'
  },
  'Maximum unavailable': { fr: 'Maximum indisponible', es: 'Máximo no disponible' },
  'Multisig setup resumed': {
    fr: 'Configuration multisignature reprise',
    es: 'Configuración multifirma reanudada'
  },
  'Multisig wallet created': {
    fr: 'Portefeuille multisignature créé',
    es: 'Cartera multifirma creada'
  },
  'Network setup reused': {
    fr: 'Configuration réseau réutilisée',
    es: 'Configuración de red reutilizada'
  },
  'New address ready': { fr: 'Nouvelle adresse prête', es: 'Nueva dirección lista' },
  'Node saved and verified': { fr: 'Nœud enregistré et vérifié', es: 'Nodo guardado y verificado' },
  'Node unavailable': { fr: 'Nœud indisponible', es: 'Nodo no disponible' },
  'Now choose its standard or hidden wallet.': {
    fr: 'Choisissez maintenant son portefeuille standard ou masqué.',
    es: 'Elige ahora su cartera estándar u oculta.'
  },
  'PDF not saved': { fr: 'PDF non enregistré', es: 'PDF no guardado' },
  'PDF saved': { fr: 'PDF enregistré', es: 'PDF guardado' },
  'PSBT copied': { fr: 'PSBT copiée', es: 'PSBT copiada' },
  'PSBT saved': { fr: 'PSBT enregistrée', es: 'PSBT guardada' },
  'Payment canceled': { fr: 'Paiement annulé', es: 'Pago cancelado' },
  'Label saved': {
    fr: 'Libellé enregistré',
    es: 'Etiqueta guardada'
  },
  'Policy status unavailable': {
    fr: 'État de la politique indisponible',
    es: 'Estado de la política no disponible'
  },
  'Public descriptor ready': { fr: 'Descripteur public prêt', es: 'Descriptor público listo' },
  'Public signer imported': { fr: 'Signataire public importé', es: 'Firmante público importado' },
  'Public watch-only descriptor copied.': {
    fr: 'Descripteur public d’observation copié.',
    es: 'Descriptor público de solo lectura copiado.'
  },
  'Receive address ready': { fr: 'Adresse de réception prête', es: 'Dirección de recepción lista' },
  'Recipient address copied': {
    fr: 'Adresse du destinataire copiée',
    es: 'Dirección del destinatario copiada'
  },
  'Recovery backup verified': {
    fr: 'Sauvegarde de récupération vérifiée',
    es: 'Copia de recuperación verificada'
  },
  'Resuming the signer health check.': {
    fr: 'Reprise du contrôle d’état du signataire.',
    es: 'Reanudando la comprobación del firmante.'
  },
  'Return when your written recovery words are available.': {
    fr: 'Revenez lorsque vos mots de récupération écrits sont disponibles.',
    es: 'Vuelve cuando tengas disponibles tus palabras de recuperación escritas.'
  },
  'Scanning again for its public fingerprint.': {
    fr: 'Nouvelle recherche de son empreinte publique.',
    es: 'Buscando de nuevo su huella pública.'
  },
  'Scanning again so you can select this signer.': {
    fr: 'Nouvelle recherche pour vous permettre de sélectionner ce signataire.',
    es: 'Buscando de nuevo para que puedas seleccionar este firmante.'
  },
  'Scanning again so you can verify the unchanged address.': {
    fr: 'Nouvelle recherche pour vérifier que l’adresse est inchangée.',
    es: 'Buscando de nuevo para verificar que la dirección no ha cambiado.'
  },
  'Select and copy it manually.': {
    fr: 'Sélectionnez-la et copiez-la manuellement.',
    es: 'Selecciónala y cópiala manualmente.'
  },
  'Select and copy the address manually.': {
    fr: 'Sélectionnez et copiez l’adresse manuellement.',
    es: 'Selecciona y copia la dirección manualmente.'
  },
  'Incoming payments and receive addresses refreshed.': {
    fr: 'Les paiements entrants et les adresses de réception ont été actualisés.',
    es: 'Se actualizaron los pagos entrantes y las direcciones de recepción.'
  },
  'Refresh payments': {
    fr: 'Actualiser les paiements',
    es: 'Actualizar pagos'
  },
  'Refresh activity': { fr: 'Actualiser l’activité', es: 'Actualizar actividad' },
  'Refreshing activity…': {
    fr: 'Actualisation de l’activité…',
    es: 'Actualizando actividad…'
  },
  'Transactions refreshed.': {
    fr: 'Transactions actualisées.',
    es: 'Transacciones actualizadas.'
  },
  'Could not refresh activity.': {
    fr: 'Impossible d’actualiser l’activité.',
    es: 'No se pudo actualizar la actividad.'
  },
  'Refreshing payments…': {
    fr: 'Actualisation des paiements…',
    es: 'Actualizando pagos…'
  },
  'Setup discarded': { fr: 'Configuration abandonnée', es: 'Configuración descartada' },
  'Signature added': { fr: 'Signature ajoutée', es: 'Firma añadida' },
  'Signed PSBT file loaded': {
    fr: 'Fichier PSBT signé chargé',
    es: 'Archivo PSBT firmado cargado'
  },
  'Signed PSBT merged': { fr: 'PSBT signée fusionnée', es: 'PSBT firmada combinada' },
  'Signed PSBT rejected': { fr: 'PSBT signée rejetée', es: 'PSBT firmada rechazada' },
  'Signed PSBT validated': { fr: 'PSBT signée validée', es: 'PSBT firmada validada' },
  'Signer already added': { fr: 'Signataire déjà ajouté', es: 'Firmante ya añadido' },
  'Signer removed': { fr: 'Signataire supprimé', es: 'Firmante eliminado' },
  'Signer renamed': { fr: 'Signataire renommé', es: 'Firmante renombrado' },
  'Signer verified': { fr: 'Signataire vérifié', es: 'Firmante verificado' },
  'Signing and verification screens now use the new local name.': {
    fr: 'Les écrans de signature et de vérification utilisent désormais le nouveau nom local.',
    es: 'Las pantallas de firma y verificación usan ahora el nuevo nombre local.'
  },
  'Sync failed': { fr: 'Échec de la synchronisation', es: 'Error de sincronización' },
  'Tap Copy address to copy it.': {
    fr: 'Touchez Copier l’adresse pour la copier.',
    es: 'Pulsa Copiar dirección para copiarla.'
  },
  'The device returned the correct first address. Continue to transaction signing.': {
    fr: 'L’appareil a renvoyé la bonne première adresse. Poursuivez avec la signature de la transaction.',
    es: 'El dispositivo devolvió la primera dirección correcta. Continúa con la firma de la transacción.'
  },
  'The exact comparison address is on your clipboard.': {
    fr: 'L’adresse exacte de comparaison est dans le presse-papiers.',
    es: 'La dirección exacta de comparación está en el portapapeles.'
  },
  'The label is stored locally.': {
    fr: 'Le libellé est enregistré localement.',
    es: 'La etiqueta se guarda localmente.'
  },
  'The label is stored with the wallet.': {
    fr: 'Le libellé est enregistré avec le portefeuille.',
    es: 'La etiqueta se guarda con la cartera.'
  },
  'The previously unlabeled received output now has known local provenance.': {
    fr: 'La sortie reçue auparavant sans libellé possède désormais une provenance locale connue.',
    es: 'La salida recibida que no tenía etiqueta ahora tiene una procedencia local conocida.'
  },
  'The public wallet backup was saved.': {
    fr: 'La sauvegarde publique du portefeuille a été enregistrée.',
    es: 'La copia pública de la cartera se guardó.'
  },
  'The public wallet backup was written to the selected file.': {
    fr: 'La sauvegarde publique du portefeuille a été écrite dans le fichier sélectionné.',
    es: 'La copia pública de la cartera se escribió en el archivo seleccionado.'
  },
  'The public wallet descriptor was written to the selected file.': {
    fr: 'Le descripteur public du portefeuille a été écrit dans le fichier sélectionné.',
    es: 'El descriptor público de la cartera se escribió en el archivo seleccionado.'
  },
  'The saved public multisig draft was removed.': {
    fr: 'Le brouillon multisignature public enregistré a été supprimé.',
    es: 'Se eliminó el borrador multifirma público guardado.'
  },
  'The transaction and any collected signatures were discarded.': {
    fr: 'La transaction et toutes les signatures recueillies ont été écartées.',
    es: 'Se descartaron la transacción y todas las firmas recopiladas.'
  },
  'The transaction details are unchanged and ready for hardware signing again.': {
    fr: 'Les détails de la transaction sont inchangés et prêts pour une nouvelle signature matérielle.',
    es: 'Los detalles de la transacción no cambiaron y están listos para volver a firmarse con el dispositivo.'
  },
  'The unfinished multisig wallet setup was removed.': {
    fr: 'La configuration inachevée du portefeuille multisignature a été supprimée.',
    es: 'Se eliminó la configuración incompleta de la cartera multifirma.'
  },
  'The unsigned transaction and any collected signatures were discarded.': {
    fr: 'La transaction non signée et toutes les signatures recueillies ont été écartées.',
    es: 'Se descartaron la transacción sin firmar y todas las firmas recopiladas.'
  },
  'The unsigned transaction was saved to the selected file.': {
    fr: 'La transaction non signée a été enregistrée dans le fichier sélectionné.',
    es: 'La transacción sin firmar se guardó en el archivo seleccionado.'
  },
  'The verification time was saved with this address.': {
    fr: 'L’heure de vérification a été enregistrée avec cette adresse.',
    es: 'La hora de verificación se guardó con esta dirección.'
  },
  'This signer is ready for transaction review.': {
    fr: 'Ce signataire est prêt pour la vérification des transactions.',
    es: 'Este firmante está listo para revisar transacciones.'
  },
  'This watch-only backup cannot sign, but it reveals wallet activity.': {
    fr: 'Cette sauvegarde d’observation ne peut pas signer, mais elle révèle l’activité du portefeuille.',
    es: 'Esta copia de solo lectura no puede firmar, pero revela la actividad de la cartera.'
  },
  'Transaction ID copied': {
    fr: 'Identifiant de transaction copié',
    es: 'ID de transacción copiado'
  },
  'Transaction broadcast': { fr: 'Transaction diffusée', es: 'Transacción difundida' },
  'Trezor unlock unavailable': {
    fr: 'Déverrouillage Trezor indisponible',
    es: 'Desbloqueo de Trezor no disponible'
  },
  'Trezor unlocked': { fr: 'Trezor déverrouillé', es: 'Trezor desbloqueado' },
  'Use this file for a clean-profile recovery test.': {
    fr: 'Utilisez ce fichier pour un test de récupération dans un profil vierge.',
    es: 'Usa este archivo para una prueba de recuperación en un perfil limpio.'
  },
  'Wallet created': { fr: 'Portefeuille créé', es: 'Cartera creada' },
  'Wallet deleted': { fr: 'Portefeuille supprimé', es: 'Cartera eliminada' },
  'Wallet is offline': { fr: 'Le portefeuille est hors ligne', es: 'La cartera está sin conexión' },
  'Wallet is up to date': { fr: 'Le portefeuille est à jour', es: 'La cartera está actualizada' },
  'Wallet name updated': {
    fr: 'Nom du portefeuille mis à jour',
    es: 'Nombre de la cartera actualizado'
  },
  'Wallet not switched': {
    fr: 'Changement de portefeuille impossible',
    es: 'No se cambió de cartera'
  },
  'Wallet policy verified': {
    fr: 'Politique du portefeuille vérifiée',
    es: 'Política de la cartera verificada'
  },
  'Wallet recovered': { fr: 'Portefeuille récupéré', es: 'Cartera recuperada' },
  'Wallet sync source updated': {
    fr: 'Source de synchronisation mise à jour',
    es: 'Fuente de sincronización actualizada'
  },
  'You can return to verification whenever you are ready.': {
    fr: 'Vous pourrez reprendre la vérification lorsque vous serez prêt.',
    es: 'Puedes volver a la verificación cuando quieras.'
  },
  'Your reconstructed word order matched this wallet.': {
    fr: 'L’ordre reconstitué des mots correspond à ce portefeuille.',
    es: 'El orden reconstruido de las palabras coincide con esta cartera.'
  },
  'Your recovery words remain available to reveal again before verification.': {
    fr: 'Vos mots de récupération restent disponibles pour être affichés à nouveau avant la vérification.',
    es: 'Tus palabras de recuperación siguen disponibles para volver a mostrarlas antes de la verificación.'
  },
  'Your written words matched this wallet.': {
    fr: 'Vos mots écrits correspondent à ce portefeuille.',
    es: 'Tus palabras escritas coinciden con esta cartera.'
  },
  '{processed} / {total} blocks': {
    fr: '{processed} / {total} blocs',
    es: '{processed} / {total} bloques'
  },
  '20 is standard. It controls address discovery, not block-scan speed.': {
    fr: '20 est la valeur standard. Elle contrôle la découverte des adresses, pas la vitesse d’analyse des blocs.',
    es: '20 es el valor estándar. Controla el descubrimiento de direcciones, no la velocidad del escaneo de bloques.'
  },
  'A birthday makes the first scan faster. Full history always remains available.': {
    fr: 'Une date de naissance accélère la première analyse. L’historique complet reste toujours disponible.',
    es: 'Una fecha de nacimiento acelera el primer escaneo. El historial completo siempre seguirá disponible.'
  },
  'Balance and activity remain unverified until the scan completes.': {
    fr: 'Le solde et l’activité restent non vérifiés jusqu’à la fin de l’analyse.',
    es: 'El saldo y la actividad permanecerán sin verificar hasta que termine el escaneo.'
  },
  'Birthday block {height} · gap limit {gap}': {
    fr: 'Bloc de naissance {height} · limite d’écart {gap}',
    es: 'Bloque de nacimiento {height} · límite de separación {gap}'
  },
  'Choose scan': { fr: 'Choisir l’analyse', es: 'Elegir escaneo' },
  'Choose the earliest block Groot should inspect before relying on balance or activity.': {
    fr: 'Choisissez le premier bloc que Groot doit examiner avant de vous fier au solde ou à l’activité.',
    es: 'Elige el primer bloque que Groot debe inspeccionar antes de confiar en el saldo o la actividad.'
  },
  'Choose where wallet history begins': {
    fr: 'Choisissez le début de l’historique du portefeuille',
    es: 'Elige dónde comienza el historial de la cartera'
  },
  'Complete or resume the first scan before relying on activity.': {
    fr: 'Terminez ou reprenez la première analyse avant de vous fier à l’activité.',
    es: 'Completa o reanuda el primer escaneo antes de confiar en la actividad.'
  },
  'Continue from the last safely saved block. Locking Groot will no longer stop this scan.': {
    fr: 'Reprenez depuis le dernier bloc enregistré en sécurité. Le verrouillage de Groot n’arrêtera plus cette analyse.',
    es: 'Continúa desde el último bloque guardado de forma segura. Bloquear Groot ya no detendrá este escaneo.'
  },
  'Existing wallet · use a birthday block': {
    fr: 'Portefeuille existant · utiliser un bloc de naissance',
    es: 'Cartera existente · usar un bloque de nacimiento'
  },
  'Existing wallet options': {
    fr: 'Options pour un portefeuille existant',
    es: 'Opciones para una cartera existente'
  },
  'First wallet-history scan': {
    fr: 'Première analyse de l’historique',
    es: 'Primer escaneo del historial'
  },
  'Full history · safest': {
    fr: 'Historique complet · le plus sûr',
    es: 'Historial completo · lo más seguro'
  },
  'Hide existing-wallet options': {
    fr: 'Masquer les options du portefeuille existant',
    es: 'Ocultar opciones de cartera existente'
  },
  'Address discovery options': {
    fr: 'Options de découverte des adresses',
    es: 'Opciones de descubrimiento de direcciones'
  },
  'Hide address discovery options': {
    fr: 'Masquer les options de découverte des adresses',
    es: 'Ocultar opciones de descubrimiento de direcciones'
  },
  'If uncertain, choose full history instead of guessing.': {
    fr: 'En cas de doute, choisissez l’historique complet plutôt que d’estimer.',
    es: 'Si no estás seguro, elige el historial completo en vez de adivinar.'
  },
  'New wallet · no earlier activity': {
    fr: 'Nouveau portefeuille · aucune activité antérieure',
    es: 'Cartera nueva · sin actividad anterior'
  },
  'Not now': { fr: 'Pas maintenant', es: 'Ahora no' },
  'Not verified yet': { fr: 'Pas encore vérifié', es: 'Aún sin verificar' },
  'Resume scan': { fr: 'Reprendre l’analyse', es: 'Reanudar escaneo' },
  'Resume wallet-history scan': {
    fr: 'Reprendre l’analyse de l’historique',
    es: 'Reanudar el escaneo del historial'
  },
  'Resuming…': { fr: 'Reprise…', es: 'Reanudando…' },
  'Saved progress: {percent}%': {
    fr: 'Progression enregistrée : {percent} %',
    es: 'Progreso guardado: {percent}%'
  },
  'Scan from genesis. This can take tens of minutes on Testnet4.': {
    fr: 'Analyser depuis le bloc initial. Cela peut prendre plusieurs dizaines de minutes sur Testnet4.',
    es: 'Escanear desde el bloque génesis. Puede tardar decenas de minutos en Testnet4.'
  },
  'Syncing · {percent}%': {
    fr: 'Synchronisation · {percent} %',
    es: 'Sincronizando · {percent}%'
  },
  'Start at the current chain tip. Fastest, but it will not find older payments.': {
    fr: 'Commencer à la pointe actuelle de la chaîne. C’est le plus rapide, mais les anciens paiements ne seront pas trouvés.',
    es: 'Empezar en la punta actual de la cadena. Es lo más rápido, pero no encontrará pagos anteriores.'
  },
  'Start before the wallet’s first payment. Earlier is safer; later is faster.': {
    fr: 'Commencez avant le premier paiement du portefeuille. Plus tôt est plus sûr ; plus tard est plus rapide.',
    es: 'Empieza antes del primer pago de la cartera. Más temprano es más seguro; más tarde es más rápido.'
  },
  'Start scan': { fr: 'Démarrer l’analyse', es: 'Iniciar escaneo' },
  'Starting scan…': { fr: 'Démarrage de l’analyse…', es: 'Iniciando escaneo…' },
  'The saved balance and activity now reflect the completed scan.': {
    fr: 'Le solde et l’activité enregistrés reflètent maintenant l’analyse terminée.',
    es: 'El saldo y la actividad guardados ya reflejan el escaneo completado.'
  },
  'Unverified balance': { fr: 'Solde non vérifié', es: 'Saldo sin verificar' },
  'Used only to authenticate this saved recovery operation.': {
    fr: 'Utilisé uniquement pour authentifier cette opération de récupération enregistrée.',
    es: 'Se usa únicamente para autenticar esta operación de recuperación guardada.'
  },
  'Wallet history not verified': {
    fr: 'Historique du portefeuille non vérifié',
    es: 'Historial de la cartera sin verificar'
  },
  'Wallet history start': {
    fr: 'Début de l’historique du portefeuille',
    es: 'Inicio del historial de la cartera'
  },
  'Wallet history verified': {
    fr: 'Historique du portefeuille vérifié',
    es: 'Historial de la cartera verificado'
  },
  'Wallet-history scan paused': {
    fr: 'Analyse de l’historique en pause',
    es: 'Escaneo del historial en pausa'
  }
} as const satisfies Record<string, Translation>;

export type CopyKey = keyof typeof copyCatalog;

function interpolate(message: string, values: MessageValues): string {
  return message.replace(/\{([A-Za-z][A-Za-z0-9]*)\}/g, (match, name: string) =>
    Object.hasOwn(values, name) ? String(values[name]) : match
  );
}

export function translate(current: Locale, source: string, values: MessageValues = {}): string {
  const normalizedSource = source.replace(/\s+/g, ' ').trim();
  const translation = copyCatalog[normalizedSource as CopyKey];
  const message = current === 'en' || !translation ? source : translation[current];
  return interpolate(message, values);
}

const errorCategoryCopy = {
  invalid_credential: { fr: 'Identifiant incorrect.', es: 'Credencial incorrecta.' },
  wallet_locked: {
    fr: 'Déverrouillez le portefeuille pour continuer.',
    es: 'Desbloquea la cartera para continuar.'
  },
  network_unavailable: {
    fr: 'Bitcoin Core est indisponible. Vérifiez la connexion dans Réglages.',
    es: 'Bitcoin Core no está disponible. Comprueba la conexión en Ajustes.'
  },
  node_syncing: {
    fr: 'Bitcoin Core est encore en cours de synchronisation. Attendez qu’il ait atteint le dernier bloc vérifié du portefeuille, puis réessayez.',
    es: 'Bitcoin Core aún se está sincronizando. Espera a que alcance el último bloque verificado de la cartera e inténtalo de nuevo.'
  },
  node_history_unavailable: {
    fr: 'Bitcoin Core ne conserve plus les blocs nécessaires. Choisissez une date de création située dans l’historique conservé ou connectez un nœud d’archive.',
    es: 'Bitcoin Core ya no conserva los bloques necesarios. Elige un bloque de nacimiento dentro del historial conservado o conecta un nodo de archivo.'
  },
  hardware_unavailable: {
    fr: 'Le signataire matériel est indisponible. Vérifiez sa connexion et réessayez.',
    es: 'El firmante físico no está disponible. Comprueba la conexión e inténtalo de nuevo.'
  },
  hardware_pairing_required: {
    fr: 'Associez cette BitBox dans BitBoxApp et vérifiez que BitBoxApp peut l’ouvrir. Quittez ensuite complètement BitBoxApp, puis relancez la recherche dans Groot.',
    es: 'Empareja esta BitBox en BitBoxApp y comprueba que BitBoxApp puede abrirla. Después, cierra BitBoxApp por completo y vuelve a buscar en Groot.'
  },
  hardware_policy_unsupported: {
    fr: 'La signature USB et l’affichage d’adresse ne sont pas disponibles pour cette politique Miniscript différée avec la version HWI intégrée à Groot. Utilisez le flux PSBT hors ligne.',
    es: 'La firma USB y la visualización de direcciones no están disponibles para esta política Miniscript diferida con la versión HWI integrada en Groot. Usa el flujo PSBT sin conexión.'
  },
  hardware_busy: {
    fr: 'Le signataire matériel est occupé. Terminez l’autre opération et réessayez.',
    es: 'El firmante físico está ocupado. Termina la otra operación e inténtalo de nuevo.'
  },
  hardware_timeout: {
    fr: 'Le signataire matériel n’a pas répondu à temps.',
    es: 'El firmante físico no respondió a tiempo.'
  },
  hardware_cancelled: {
    fr: 'L’opération matérielle a été annulée.',
    es: 'La operación del dispositivo se canceló.'
  },
  scan_cancelled: { fr: 'L’analyse a été annulée.', es: 'El escaneo se canceló.' },
  invalid_address: {
    fr: 'L’adresse Bitcoin n’est pas valide pour ce réseau.',
    es: 'La dirección de Bitcoin no es válida para esta red.'
  },
  invalid_payment_request: {
    fr: 'Le code QR n’est pas une demande de paiement Bitcoin valide pour ce réseau.',
    es: 'El código QR no es una solicitud de pago de Bitcoin válida para esta red.'
  },
  insufficient_funds: {
    fr: 'Le portefeuille ne dispose pas de fonds suffisants pour ce paiement et ses frais.',
    es: 'La cartera no tiene fondos suficientes para este pago y su comisión.'
  },
  fee_rate_too_low: {
    fr: 'Choisissez un taux supérieur au minimum de remplacement de la transaction initiale.',
    es: 'Elige una tasa superior al mínimo de reemplazo de la transacción original.'
  },
  rate_limited: {
    fr: 'Trop de tentatives. Attendez avant de réessayer.',
    es: 'Demasiados intentos. Espera antes de volver a intentarlo.'
  }
} as const;

export function localizedError(
  cause: unknown,
  current: Locale,
  fallback = 'Something went wrong. Try again.'
): string {
  if (current === 'en') {
    if (cause && typeof cause === 'object' && 'code' in cause) {
      if (cause.code === 'network_unavailable')
        return 'Bitcoin Core is unavailable. Check the connection in Settings.';
      if (cause.code === 'internal_error') return fallback;
    }
    return cause instanceof Error ? cause.message : fallback;
  }
  if (cause && typeof cause === 'object' && 'code' in cause) {
    const category = errorCategoryCopy[String(cause.code) as keyof typeof errorCategoryCopy];
    if (category) return category[current];
  }
  if (cause instanceof Error) {
    const exact = translate(current, cause.message);
    if (exact !== cause.message) return exact;
  }
  const translatedFallback = translate(current, fallback);
  return translatedFallback === fallback
    ? current === 'fr'
      ? 'Une erreur est survenue. Réessayez.'
      : 'Se produjo un error. Inténtalo de nuevo.'
    : translatedFallback;
}

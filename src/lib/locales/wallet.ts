import type { CatalogSection } from './types';

export const walletCopy = {
  'Automatic selection will leave them untouched.': {
    fr: 'La sélection automatique les laissera intactes.',
    es: 'La selección automática las dejará intactas.'
  },
  'Coins frozen': { fr: 'Pièces gelées', es: 'Monedas congeladas' },
  'Coins unfrozen': { fr: 'Pièces dégelées', es: 'Monedas descongeladas' },
  'They are available to spend again.': {
    fr: 'Elles sont de nouveau disponibles pour être dépensées.',
    es: 'Vuelven a estar disponibles para gastar.'
  },
  '{amount} {unit} awaiting confirmation': {
    fr: '{amount} {unit} en attente de confirmation',
    es: '{amount} {unit} pendientes de confirmación'
  },
  '{amount} {unit} outgoing': { fr: '{amount} {unit} sortants', es: '{amount} {unit} salientes' },
  '{amount} {unit} unconfirmed change': {
    fr: '{amount} {unit} de monnaie non confirmée',
    es: '{amount} {unit} de cambio sin confirmar'
  },
  '{connected} of {required} required peers connected': {
    fr: '{connected} pairs connectés sur {required} requis',
    es: '{connected} de {required} pares requeridos conectados'
  },
  '{rate} sat/vB': { fr: '{rate} sat/vB', es: '{rate} sat/vB' },
  '{required} of {total}': { fr: '{required} sur {total}', es: '{required} de {total}' },
  '{signed} of {required} signatures collected': {
    fr: '{signed} signatures collectées sur {required}',
    es: '{signed} de {required} firmas recopiladas'
  },
  '{threshold} of {total} wallet policy': {
    fr: 'Politique de portefeuille {threshold} sur {total}',
    es: 'Política de cartera {threshold} de {total}'
  },
  '0 {unit} pending': { fr: '0 {unit} en attente', es: '0 {unit} pendientes' },
  'Balance remains verified through block {height}. Retry when your connection is available.': {
    fr: 'Le solde reste vérifié jusqu’au bloc {height}. Réessayez lorsque votre connexion est disponible.',
    es: 'El saldo permanece verificado hasta el bloque {height}. Vuelve a intentarlo cuando haya conexión.'
  },
  'Network height {height} · verified wallet state stays unchanged until completion': {
    fr: 'Hauteur du réseau {height} · l’état vérifié du portefeuille reste inchangé jusqu’à la fin',
    es: 'Altura de red {height} · el estado verificado de la cartera no cambia hasta finalizar'
  },
  'Verified wallet state stays unchanged until the scan completes.': {
    fr: 'L’état vérifié du portefeuille reste inchangé jusqu’à la fin de l’analyse.',
    es: 'El estado verificado de la cartera no cambia hasta que finalice el escaneo.'
  },
  'Loading wallet signer': {
    fr: 'Chargement du signataire du portefeuille',
    es: 'Cargando el firmante de la cartera'
  },
  wallet: { fr: 'portefeuille', es: 'cartera' },
  '{count} wallet input': {
    fr: '{count} entrée du portefeuille',
    es: '{count} entrada de la cartera'
  },
  '{count} wallet inputs': {
    fr: '{count} entrées du portefeuille',
    es: '{count} entradas de la cartera'
  },
  'No matching transactions': {
    fr: 'Aucune transaction correspondante',
    es: 'No hay transacciones coincidentes'
  },
  'No received transactions': {
    fr: 'Aucune transaction reçue',
    es: 'No hay transacciones recibidas'
  },
  'No sent transactions': { fr: 'Aucune transaction envoyée', es: 'No hay transacciones enviadas' },
  'Try a different label or filter.': {
    fr: 'Essayez un autre libellé ou filtre.',
    es: 'Prueba otra etiqueta o filtro.'
  },
  'Payments you send and receive will appear here.': {
    fr: 'Les paiements envoyés et reçus apparaîtront ici.',
    es: 'Los pagos que envíes y recibas aparecerán aquí.'
  },
  'This wallet has no received transactions yet.': {
    fr: 'Ce portefeuille n’a encore reçu aucune transaction.',
    es: 'Esta cartera aún no tiene transacciones recibidas.'
  },
  'This wallet has no sent transactions yet.': {
    fr: 'Ce portefeuille n’a encore envoyé aucune transaction.',
    es: 'Esta cartera aún no tiene transacciones enviadas.'
  },
  Activity: { fr: 'Activité', es: 'Actividad' },
  Coins: { fr: 'Pièces', es: 'Monedas' },
  'Confirm your written words so you know this wallet can be recovered.': {
    fr: 'Confirmez vos mots écrits pour savoir que ce portefeuille peut être récupéré.',
    es: 'Confirma tus palabras escritas para saber que esta cartera puede recuperarse.'
  },
  'Export & verify': { fr: 'Exporter et vérifier', es: 'Exportar y verificar' },
  'Health check': { fr: 'Contrôle d’état', es: 'Comprobación de estado' },
  'Inspect and choose UTXOs': {
    fr: 'Inspecter et choisir les UTXO',
    es: 'Inspeccionar y elegir UTXO'
  },
  'Inspect receive and change logic': {
    fr: 'Inspecter la logique de réception et de monnaie',
    es: 'Inspeccionar la lógica de recepción y cambio'
  },
  'Keys, backups, and rules': { fr: 'Clés, sauvegardes et règles', es: 'Claves, copias y reglas' },
  Overview: { fr: 'Aperçu', es: 'Resumen' },
  Policy: { fr: 'Politique', es: 'Política' },
  Receive: { fr: 'Recevoir', es: 'Recibir' },
  'Recent activity': { fr: 'Activité récente', es: 'Actividad reciente' },
  'Recovery backup not verified': {
    fr: 'Sauvegarde de récupération non vérifiée',
    es: 'Copia de recuperación sin verificar'
  },
  Resume: { fr: 'Reprendre', es: 'Reanudar' },
  'Save a public wallet backup': {
    fr: 'Enregistrer une sauvegarde publique du portefeuille',
    es: 'Guardar una copia pública de la cartera'
  },
  Send: { fr: 'Envoyer', es: 'Enviar' },
  'Show descriptors': { fr: 'Afficher les descripteurs', es: 'Mostrar descriptores' },
  'Total balance': { fr: 'Solde total', es: 'Saldo total' },
  'Verify the connected signer identity': {
    fr: 'Vérifier l’identité du signataire connecté',
    es: 'Verificar la identidad del firmante conectado'
  },
  'View all': { fr: 'Tout afficher', es: 'Ver todo' },
  'View all transactions': {
    fr: 'Afficher toutes les transactions',
    es: 'Ver todas las transacciones'
  },
  WALLET: { fr: 'PORTEFEUILLE', es: 'CARTERA' },
  All: { fr: 'Toutes', es: 'Todas' },
  'Biggest amount': { fr: 'Montant le plus élevé', es: 'Importe más alto' },
  'Earliest first': { fr: 'Plus anciennes d’abord', es: 'Más antiguas primero' },
  HISTORY: { fr: 'HISTORIQUE', es: 'HISTORIAL' },
  'Latest first': { fr: 'Plus récentes d’abord', es: 'Más recientes primero' },
  Received: { fr: 'Reçues', es: 'Recibidas' },
  Search: { fr: 'Rechercher', es: 'Buscar' },
  Sent: { fr: 'Envoyées', es: 'Enviadas' },
  'Smallest amount': { fr: 'Montant le plus faible', es: 'Importe más bajo' },
  Sort: { fr: 'Trier', es: 'Ordenar' },
  'Add label': { fr: 'Ajouter un libellé', es: 'Añadir etiqueta' },
  Address: { fr: 'Adresse', es: 'Dirección' },
  'Address reused': { fr: 'Adresse réutilisée', es: 'Dirección reutilizada' },
  'All sources': { fr: 'Toutes les sources', es: 'Todos los orígenes' },
  'Assign its first permanent label once.': {
    fr: 'Attribuez-lui une fois son premier libellé permanent.',
    es: 'Asígnale una vez su primera etiqueta permanente.'
  },
  'Automatic selection remains the default': {
    fr: 'La sélection automatique reste la valeur par défaut',
    es: 'La selección automática sigue siendo la opción predeterminada'
  },
  'Change lineage': { fr: 'Lignée de la monnaie', es: 'Linaje del cambio' },
  'Choose exactly what a payment may spend.': {
    fr: 'Choisissez exactement ce qu’un paiement peut dépenser.',
    es: 'Elige exactamente qué puede gastar un pago.'
  },
  coins: { fr: 'pièces', es: 'monedas' },
  COINS: { fr: 'PIÈCES', es: 'MONEDAS' },
  Details: { fr: 'Détails', es: 'Detalles' },
  Freeze: { fr: 'Geler', es: 'Congelar' },
  'Freeze selected': { fr: 'Geler la sélection', es: 'Congelar selección' },
  Frozen: { fr: 'Gelée', es: 'Congelada' },
  Known: { fr: 'Connue', es: 'Conocida' },
  Label: { fr: 'Libellé', es: 'Etiqueta' },
  'Linked coin': { fr: 'Pièce liée', es: 'Moneda vinculada' },
  Mixed: { fr: 'Mélangée', es: 'Mezclada' },
  'Mixed provenance': { fr: 'Provenance mélangée', es: 'Procedencia mezclada' },
  'No local label': { fr: 'Aucun libellé local', es: 'Sin etiqueta local' },
  'No spendable outputs yet': {
    fr: 'Aucune sortie dépensable pour le moment',
    es: 'Aún no hay salidas disponibles para gastar'
  },
  Outpoint: { fr: 'Point de sortie', es: 'Punto de salida' },
  'Permanent label': { fr: 'Libellé permanent', es: 'Etiqueta permanente' },
  'Privacy clusters': { fr: 'Groupes de confidentialité', es: 'Grupos de privacidad' },
  'The permanent labels inherited from this coin’s receive address or funding inputs.': {
    fr: 'Les libellés permanents hérités de l’adresse de réception de cette pièce ou de ses entrées de financement.',
    es: 'Las etiquetas permanentes heredadas de la dirección de recepción de esta moneda o de sus entradas de financiación.'
  },
  'Groups already linked by transaction history. Spending across groups creates a new public link.':
    {
      fr: 'Groupes déjà reliés par l’historique des transactions. Dépenser depuis plusieurs groupes crée un nouveau lien public.',
      es: 'Grupos ya vinculados por el historial de transacciones. Gastar desde varios grupos crea un nuevo vínculo público.'
    },
  'The permanent label of the payment that created this change. It can differ from the labels this coin inherited.':
    {
      fr: 'Le libellé permanent du paiement à l’origine de cette monnaie. Il peut différer des libellés hérités par cette pièce.',
      es: 'La etiqueta permanente del pago que creó este cambio. Puede diferir de las etiquetas heredadas por esta moneda.'
    },
  'How many wallet inputs were combined to create this change coin.': {
    fr: 'Nombre d’entrées du portefeuille combinées pour créer cette pièce de monnaie.',
    es: 'Cuántas entradas de la cartera se combinaron para crear esta moneda de cambio.'
  },
  Provenance: { fr: 'Provenance', es: 'Procedencia' },
  'Received bitcoin will appear here after sync.': {
    fr: 'Le bitcoin reçu apparaîtra ici après synchronisation.',
    es: 'El bitcoin recibido aparecerá aquí después de sincronizar.'
  },
  'Save permanent label': {
    fr: 'Enregistrer le libellé permanent',
    es: 'Guardar etiqueta permanente'
  },
  selected: { fr: 'sélectionnées', es: 'seleccionadas' },
  'Send selected coins': {
    fr: 'Envoyer les pièces sélectionnées',
    es: 'Enviar monedas seleccionadas'
  },
  'Source payment intent': { fr: 'Objet du paiement source', es: 'Motivo del pago de origen' },
  'Source transaction': { fr: 'Transaction source', es: 'Transacción de origen' },
  'Spending them separately cannot undo their public link. Use a fresh labeled address for future payments.':
    {
      fr: 'Les dépenser séparément ne peut pas annuler leur lien public. Utilisez une nouvelle adresse libellée pour les paiements futurs.',
      es: 'Gastarlas por separado no puede deshacer su vínculo público. Usa una nueva dirección etiquetada para futuros pagos.'
    },
  Unconfirmed: { fr: 'Non confirmée', es: 'Sin confirmar' },
  Unfreeze: { fr: 'Dégeler', es: 'Descongelar' },
  'Unknown source': { fr: 'Source inconnue', es: 'Origen desconocido' },
  'wallet input': { fr: 'entrée du portefeuille', es: 'entrada de la cartera' },
  active: { fr: 'active', es: 'activa' },
  'address details': { fr: 'détails de l’adresse', es: 'detalles de la dirección' },
  'Address history': { fr: 'Historique des adresses', es: 'Historial de direcciones' },
  Awaiting: { fr: 'En attente', es: 'Pendiente' },
  'Awaiting payment': { fr: 'En attente de paiement', es: 'Pendiente de pago' },
  'Copy address': { fr: 'Copier l’adresse', es: 'Copiar dirección' },
  'Create a labeled address for one payment.': {
    fr: 'Créez une adresse libellée pour un paiement.',
    es: 'Crea una dirección etiquetada para un pago.'
  },
  'Discard address': { fr: 'Écarter l’adresse', es: 'Descartar dirección' },
  'Discarded addresses remain monitored.': {
    fr: 'Les adresses écartées restent surveillées.',
    es: 'Las direcciones descartadas siguen supervisándose.'
  },
  'Generate a new address and give it a permanent label.': {
    fr: 'Générez une nouvelle adresse et attribuez-lui un libellé permanent.',
    es: 'Genera una nueva dirección y asígnale una etiqueta permanente.'
  },
  'Generate address': { fr: 'Générer une adresse', es: 'Generar dirección' },
  'Generating QR…': { fr: 'Génération du QR…', es: 'Generando QR…' },
  'Keep address': { fr: 'Conserver l’adresse', es: 'Conservar dirección' },
  'Native SegWit · BIP84': { fr: 'SegWit natif · BIP84', es: 'SegWit nativo · BIP84' },
  New: { fr: 'Nouvelle', es: 'Nueva' },
  'New address': { fr: 'Nouvelle adresse', es: 'Nueva dirección' },
  'No active payment requests.': {
    fr: 'Aucune demande de paiement active.',
    es: 'No hay solicitudes de pago activas.'
  },
  'No address awaiting payment': {
    fr: 'Aucune adresse en attente de paiement',
    es: 'No hay direcciones pendientes de pago'
  },
  'No past addresses yet.': {
    fr: 'Aucune ancienne adresse pour le moment.',
    es: 'Aún no hay direcciones anteriores.'
  },
  'Not verified': { fr: 'Non vérifiée', es: 'Sin verificar' },
  'Only an unused address awaiting payment can be discarded. Used addresses remain in your history.':
    {
      fr: 'Seule une adresse inutilisée en attente de paiement peut être écartée. Les adresses utilisées restent dans votre historique.',
      es: 'Solo se puede descartar una dirección sin usar pendiente de pago. Las direcciones usadas permanecen en tu historial.'
    },
  RECEIVE: { fr: 'RECEVOIR', es: 'RECIBIR' },
  'Receive bitcoin': { fr: 'Recevoir du bitcoin', es: 'Recibir bitcoin' },
  Type: { fr: 'Type', es: 'Tipo' },
  'Used and discarded addresses remain monitored.': {
    fr: 'Les adresses utilisées et écartées restent surveillées.',
    es: 'Las direcciones usadas y descartadas siguen supervisándose.'
  },
  'Verify on the saved hardware signer before sharing this address.': {
    fr: 'Vérifiez sur le signataire matériel enregistré avant de communiquer cette adresse.',
    es: 'Verifica en el firmante físico guardado antes de compartir esta dirección.'
  }
} as const satisfies CatalogSection;

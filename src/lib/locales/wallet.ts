import type { CatalogSection } from './types';

export const walletCopy = {
  'Sync unavailable': { fr: 'Synchronisation indisponible', es: 'Sincronización no disponible' },
  'The saved Bitcoin Core node is unreachable. Check that it is running and reachable, then try again.':
    {
      fr: 'Le nœud Bitcoin Core enregistré est inaccessible. Vérifiez qu’il fonctionne et qu’il est joignable, puis réessayez.',
      es: 'No se puede acceder al nodo Bitcoin Core guardado. Comprueba que esté funcionando y sea accesible, y vuelve a intentarlo.'
    },
  'Scan settings': { fr: 'Réglages d’analyse', es: 'Ajustes de escaneo' },
  'Loading wallet details…': {
    fr: 'Chargement des détails du portefeuille…',
    es: 'Cargando los detalles de la cartera…'
  },
  'Wallet details are unavailable': {
    fr: 'Les détails du portefeuille sont indisponibles',
    es: 'Los detalles de la cartera no están disponibles'
  },
  'Load more': { fr: 'Afficher plus', es: 'Mostrar más' },
  'Recovery key': { fr: 'Clé de récupération', es: 'Clave de recuperación' },
  'Heir key': { fr: 'Clé d’héritier', es: 'Clave del heredero' },
  '{key} unlocks soon': {
    fr: '{key} sera bientôt déverrouillée',
    es: '{key} se desbloqueará pronto'
  },
  '{key} can now spend a coin': {
    fr: '{key} peut maintenant dépenser une pièce',
    es: '{key} ya puede gastar una moneda'
  },
  '{count} blocks remain before it can spend one coin.': {
    fr: 'Il reste {count} blocs avant qu’elle puisse dépenser une pièce.',
    es: 'Quedan {count} bloques antes de que pueda gastar una moneda.'
  },
  'Your normal 2-of-3 keys still work. Review the coin or renew its protection.': {
    fr: 'Vos clés normales 2 sur 3 fonctionnent toujours. Vérifiez la pièce ou renouvelez sa protection.',
    es: 'Tus claves normales 2 de 3 siguen funcionando. Revisa la moneda o renueva su protección.'
  },
  '{count} coins can now be spent with the {key}': {
    fr: '{count} pièces peuvent maintenant être dépensées avec la {key}',
    es: '{count} monedas ya pueden gastarse con la {key}'
  },
  '{key} unlocks soon for {count} coins': {
    fr: '{key} sera bientôt déverrouillée pour {count} pièces',
    es: '{key} se desbloqueará pronto para {count} monedas'
  },
  '{key} is still locked': {
    fr: '{key} est encore verrouillée',
    es: '{key} sigue bloqueada'
  },
  'Next key change in {count} blocks · times are approximate': {
    fr: 'Prochain changement de clé dans {count} blocs · les durées sont approximatives',
    es: 'Próximo cambio de clave en {count} bloques · los tiempos son aproximados'
  },
  'The extra key can spend every confirmed coin shown.': {
    fr: 'La clé supplémentaire peut dépenser chaque pièce confirmée affichée.',
    es: 'La clave adicional puede gastar cada moneda confirmada mostrada.'
  },
  'Your normal 2-of-3 keys still work for every coin.': {
    fr: 'Vos clés normales 2 sur 3 fonctionnent toujours pour chaque pièce.',
    es: 'Tus claves normales 2 de 3 siguen funcionando para cada moneda.'
  },
  'Each coin has its own protection timeline': {
    fr: 'Chaque pièce a son propre calendrier de protection',
    es: 'Cada moneda tiene su propio calendario de protección'
  },
  'The recovery or heir key unlocks separately for each coin. Your normal 2-of-3 keys always remain available.':
    {
      fr: 'La clé de récupération ou d’héritier se déverrouille séparément pour chaque pièce. Vos clés normales 2 sur 3 restent toujours disponibles.',
      es: 'La clave de recuperación o del heredero se desbloquea por separado para cada moneda. Tus claves normales 2 de 3 siempre siguen disponibles.'
    },
  '{key} can spend': { fr: '{key} peut dépenser', es: '{key} puede gastar' },
  '{key} unlocks in {count} blocks': {
    fr: '{key} se déverrouille dans {count} blocs',
    es: '{key} se desbloquea en {count} bloques'
  },
  'Protection starts after confirmation': {
    fr: 'La protection commence après confirmation',
    es: 'La protección comienza tras la confirmación'
  },
  '{key} locked': { fr: '{key} verrouillée', es: '{key} bloqueada' },
  'Extra key': { fr: 'Clé supplémentaire', es: 'Clave adicional' },
  'Waiting for confirmation': {
    fr: 'En attente de confirmation',
    es: 'Esperando confirmación'
  },
  '{key} can spend this coin': {
    fr: '{key} peut dépenser cette pièce',
    es: '{key} puede gastar esta moneda'
  },
  '{key} is locked': { fr: '{key} est verrouillée', es: '{key} está bloqueada' },
  'Exact timeline': { fr: 'Calendrier exact', es: 'Calendario exacto' },
  'Extra key unlocked at block {height}': {
    fr: 'Clé supplémentaire déverrouillée au bloc {height}',
    es: 'Clave adicional desbloqueada en el bloque {height}'
  },
  '{key} can now spend this coin alone. Your normal 2-of-3 keys still work.': {
    fr: '{key} peut maintenant dépenser seule cette pièce. Vos clés normales 2 sur 3 fonctionnent toujours.',
    es: '{key} ya puede gastar esta moneda por sí sola. Tus claves normales 2 de 3 siguen funcionando.'
  },
  '{key} cannot spend this coin yet. Your normal 2-of-3 keys work now and remain available later.':
    {
      fr: '{key} ne peut pas encore dépenser cette pièce. Vos clés normales 2 sur 3 fonctionnent maintenant et resteront disponibles.',
      es: '{key} aún no puede gastar esta moneda. Tus claves normales 2 de 3 funcionan ahora y seguirán disponibles.'
    },
  'Want the extra key locked again?': {
    fr: 'Vous voulez reverrouiller la clé supplémentaire ?',
    es: '¿Quieres volver a bloquear la clave adicional?'
  },
  'Move only this coin within your wallet. Its protection restarts after confirmation.': {
    fr: 'Déplacez uniquement cette pièce dans votre portefeuille. Sa protection redémarre après confirmation.',
    es: 'Mueve solo esta moneda dentro de tu cartera. Su protección se reinicia tras la confirmación.'
  },
  'Renew protection': { fr: 'Renouveler la protection', es: 'Renovar protección' },
  'Recovery path approaching maturity': {
    fr: 'Le chemin de récupération approche de la maturité',
    es: 'La ruta de recuperación se acerca a la madurez'
  },
  'Inheritance path approaching maturity': {
    fr: 'Le chemin d’héritage approche de la maturité',
    es: 'La ruta de herencia se acerca a la madurez'
  },
  'Recovery path matured': {
    fr: 'Chemin de récupération arrivé à maturité',
    es: 'Ruta de recuperación madura'
  },
  'Inheritance path matured': {
    fr: 'Chemin d’héritage arrivé à maturité',
    es: 'Ruta de herencia madura'
  },
  '{count} blocks remain for one coin. Review its policy.': {
    fr: 'Il reste {count} blocs pour une pièce. Vérifiez sa politique.',
    es: 'Quedan {count} bloques para una moneda. Revisa su política.'
  },
  'One coin now has an additional single-key path. The normal 2-of-3 path still works.': {
    fr: 'Une pièce dispose maintenant d’un chemin à clé unique supplémentaire. Le chemin normal 2 sur 3 fonctionne toujours.',
    es: 'Una moneda dispone ahora de una ruta adicional de una sola clave. La ruta normal 2 de 3 sigue funcionando.'
  },
  '{count} coins have a matured delayed path': {
    fr: '{count} pièces ont un chemin différé arrivé à maturité',
    es: '{count} monedas tienen una ruta retrasada madura'
  },
  '{count} coins are approaching delayed-path maturity': {
    fr: '{count} pièces approchent de la maturité du chemin différé',
    es: '{count} monedas se acercan a la madurez de la ruta retrasada'
  },
  'Delayed paths are still immature': {
    fr: 'Les chemins différés ne sont pas encore arrivés à maturité',
    es: 'Las rutas retrasadas aún son inmaduras'
  },
  'Next change in {count} blocks · approximate time is secondary': {
    fr: 'Prochain changement dans {count} blocs · le temps approximatif est secondaire',
    es: 'Próximo cambio en {count} bloques · el tiempo aproximado es secundario'
  },
  'All confirmed delayed paths shown here are mature.': {
    fr: 'Tous les chemins différés confirmés affichés ici sont matures.',
    es: 'Todas las rutas retrasadas confirmadas que se muestran aquí están maduras.'
  },
  'Countdown paused until Groot verifies a recent chain tip. Saved coin states are shown as of the last sync.':
    {
      fr: 'Compte à rebours suspendu jusqu’à ce que Groot vérifie une pointe de chaîne récente. Les états enregistrés sont ceux de la dernière synchronisation.',
      es: 'Cuenta atrás en pausa hasta que Groot verifique una punta de cadena reciente. Los estados guardados corresponden a la última sincronización.'
    },
  'Maturity adds an independent single-key path. The normal 2-of-3 path stays valid.': {
    fr: 'La maturité ajoute un chemin indépendant à clé unique. Le chemin normal 2 sur 3 reste valide.',
    es: 'La madurez añade una ruta independiente de una sola clave. La ruta normal 2 de 3 sigue siendo válida.'
  },
  'Review coins': { fr: 'Vérifier les pièces', es: 'Revisar monedas' },
  'Each coin has its own delayed-path clock': {
    fr: 'Chaque pièce a sa propre horloge de chemin différé',
    es: 'Cada moneda tiene su propio reloj de ruta retrasada'
  },
  'Maturity adds a recovery or heir single-key path; it never removes the normal 2-of-3 path.': {
    fr: 'La maturité ajoute un chemin à clé unique de récupération ou d’héritier ; elle ne supprime jamais le chemin normal 2 sur 3.',
    es: 'La madurez añade una ruta de una sola clave de recuperación o heredero; nunca elimina la ruta normal 2 de 3.'
  },
  'Exact countdowns are paused because the last verified chain tip is stale or unavailable.': {
    fr: 'Les comptes à rebours exacts sont suspendus car la dernière pointe de chaîne vérifiée est ancienne ou indisponible.',
    es: 'Las cuentas atrás exactas están en pausa porque la última punta de cadena verificada está obsoleta o no disponible.'
  },
  'Delayed path mature': { fr: 'Chemin différé mature', es: 'Ruta retrasada madura' },
  'Delayed path immature': { fr: 'Chemin différé immature', es: 'Ruta retrasada inmadura' },
  '{count} blocks to maturity': {
    fr: '{count} blocs avant maturité',
    es: '{count} bloques hasta la madurez'
  },
  'Approaching maturity': { fr: 'Approche de la maturité', es: 'Acercándose a la madurez' },
  'Delay not started': { fr: 'Délai non démarré', es: 'Retraso no iniciado' },
  'Delayed spending path': { fr: 'Chemin de dépense différé', es: 'Ruta de gasto retrasada' },
  'Unconfirmed · delay not started': {
    fr: 'Non confirmée · délai non démarré',
    es: 'Sin confirmar · retraso no iniciado'
  },
  'Mature · additional single-key path available': {
    fr: 'Mature · chemin à clé unique supplémentaire disponible',
    es: 'Madura · ruta adicional de una sola clave disponible'
  },
  Immature: { fr: 'Immature', es: 'Inmadura' },
  Mature: { fr: 'Mature', es: 'Madura' },
  'Exact block status': { fr: 'État exact en blocs', es: 'Estado exacto en bloques' },
  'Paused · last verified at block {height}': {
    fr: 'Suspendu · dernière vérification au bloc {height}',
    es: 'En pausa · última verificación en el bloque {height}'
  },
  'Starts after the first confirmation': {
    fr: 'Démarre après la première confirmation',
    es: 'Comienza tras la primera confirmación'
  },
  'Mature at block {height}': { fr: 'Mature au bloc {height}', es: 'Madura en el bloque {height}' },
  '{count} blocks remaining': { fr: '{count} blocs restants', es: '{count} bloques restantes' },
  'Approximate time': { fr: 'Temps approximatif', es: 'Tiempo aproximado' },
  days: { fr: 'jours', es: 'días' },
  months: { fr: 'mois', es: 'meses' },
  years: { fr: 'ans', es: 'años' },
  'What changes': { fr: 'Ce qui change', es: 'Qué cambia' },
  'The independent delayed key can spend alone after maturity. Groot still sends only through the normal 2-of-3 path.':
    {
      fr: 'La clé différée indépendante peut dépenser seule après maturité. Groot envoie toujours uniquement par le chemin normal 2 sur 3.',
      es: 'La clave retrasada independiente puede gastar sola tras la madurez. Groot sigue enviando únicamente por la ruta normal 2 de 3.'
    },
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
  'Bitcoin Core is reachable, but its RPC user cannot run every wallet-sync method. Balance remains verified through block {height}.':
    {
      fr: 'Bitcoin Core est accessible, mais son utilisateur RPC ne peut pas exécuter toutes les méthodes de synchronisation du portefeuille. Le solde reste vérifié jusqu’au bloc {height}.',
      es: 'Bitcoin Core está accesible, pero su usuario RPC no puede ejecutar todos los métodos de sincronización de la cartera. El saldo sigue verificado hasta el bloque {height}.'
    },
  'Groot could not reconcile or save the refreshed wallet state. Balance remains verified through block {height}.':
    {
      fr: 'Groot n’a pas pu réconcilier ou enregistrer l’état actualisé du portefeuille. Le solde reste vérifié jusqu’au bloc {height}.',
      es: 'Groot no pudo conciliar o guardar el estado actualizado de la cartera. El saldo sigue verificado hasta el bloque {height}.'
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
  'Assign its first label once.': {
    fr: 'Attribuez-lui une fois son premier libellé.',
    es: 'Asígnale una vez su primera etiqueta.'
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
  'Keep this selection out of automatic payments': {
    fr: 'Exclure cette sélection des paiements automatiques',
    es: 'Excluir esta selección de los pagos automáticos'
  },
  Frozen: { fr: 'Gelée', es: 'Congelada' },
  Known: { fr: 'Connue', es: 'Conocida' },
  Label: { fr: 'Libellé', es: 'Etiqueta' },
  Labels: { fr: 'Libellés', es: 'Etiquetas' },
  'Linked coin': { fr: 'Pièce liée', es: 'Moneda vinculada' },
  Mixed: { fr: 'Mélangée', es: 'Mezclada' },
  'Mixed provenance': { fr: 'Provenance mélangée', es: 'Procedencia mezclada' },
  'No local label': { fr: 'Aucun libellé local', es: 'Sin etiqueta local' },
  'No spendable outputs yet': {
    fr: 'Aucune sortie dépensable pour le moment',
    es: 'Aún no hay salidas disponibles para gastar'
  },
  Outpoint: { fr: 'Point de sortie', es: 'Punto de salida' },
  'Add up to five labels for this address. You can reuse labels, but you cannot change them later.':
    {
      fr: 'Ajoutez jusqu’à cinq libellés pour cette adresse. Vous pouvez les réutiliser, mais pas les modifier par la suite.',
      es: 'Añade hasta cinco etiquetas para esta dirección. Puedes reutilizarlas, pero no cambiarlas después.'
    },
  'Reuse {label}': { fr: 'Réutiliser {label}', es: 'Reutilizar {label}' },
  'Remove {label}': { fr: 'Retirer {label}', es: 'Quitar {label}' },
  'Selected labels': { fr: 'Libellés sélectionnés', es: 'Etiquetas seleccionadas' },
  'Required · cannot be changed; reuse is intentional': {
    fr: 'Requis · non modifiable ; la réutilisation est volontaire',
    es: 'Obligatoria · no se puede cambiar; la reutilización es intencionada'
  },
  'Privacy clusters': { fr: 'Groupes de confidentialité', es: 'Grupos de privacidad' },
  'The labels inherited from this coin’s receive address or funding inputs.': {
    fr: 'Les libellés hérités de l’adresse de réception de cette pièce ou de ses entrées de financement.',
    es: 'Las etiquetas heredadas de la dirección de recepción de esta moneda o de sus entradas de financiación.'
  },
  'Groups already linked by transaction history. Spending across groups creates a new public link.':
    {
      fr: 'Groupes déjà reliés par l’historique des transactions. Dépenser depuis plusieurs groupes crée un nouveau lien public.',
      es: 'Grupos ya vinculados por el historial de transacciones. Gastar desde varios grupos crea un nuevo vínculo público.'
    },
  'The label of the payment that created this change. It can differ from the labels this coin inherited.':
    {
      fr: 'Le libellé du paiement à l’origine de cette monnaie. Il peut différer des libellés hérités par cette pièce.',
      es: 'La etiqueta del pago que creó este cambio. Puede diferir de las etiquetas heredadas por esta moneda.'
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
  'Save label': {
    fr: 'Enregistrer le libellé',
    es: 'Guardar etiqueta'
  },
  'The label could not be saved.': {
    fr: 'Le libellé n’a pas pu être enregistré.',
    es: 'No se pudo guardar la etiqueta.'
  },
  selected: { fr: 'sélectionnées', es: 'seleccionadas' },
  'Send selected coins': {
    fr: 'Envoyer les pièces sélectionnées',
    es: 'Enviar monedas seleccionadas'
  },
  'Send selected coin': {
    fr: 'Envoyer la pièce sélectionnée',
    es: 'Enviar moneda seleccionada'
  },
  'More actions for selected coin': {
    fr: 'Plus d’actions pour la pièce sélectionnée',
    es: 'Más acciones para la moneda seleccionada'
  },
  'More actions for selected coins': {
    fr: 'Plus d’actions pour les pièces sélectionnées',
    es: 'Más acciones para las monedas seleccionadas'
  },
  'Spend this coin with its backup key': {
    fr: 'Dépenser cette pièce avec sa clé de secours',
    es: 'Gastar esta moneda con su clave de respaldo'
  },
  'Move it within this wallet to begin a new wait': {
    fr: 'La déplacer dans ce portefeuille pour recommencer l’attente',
    es: 'Moverla dentro de esta cartera para iniciar una nueva espera'
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
  'Generate a new address and give it a label.': {
    fr: 'Générez une nouvelle adresse et attribuez-lui un libellé.',
    es: 'Genera una nueva dirección y asígnale una etiqueta.'
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

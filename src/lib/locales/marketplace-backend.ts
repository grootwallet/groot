import type { CatalogSection } from './types';

export const marketplaceBackendCopy = {
  'Bank details': { fr: 'Coordonnées bancaires', es: 'Datos bancarios' },
  'Account holder': { fr: 'Titulaire du compte', es: 'Titular de la cuenta' },
  IBAN: { fr: 'IBAN', es: 'IBAN' },
  'Where should the buyer pay?': {
    fr: 'Sur quel compte l’acheteur doit-il verser le paiement ?',
    es: '¿En qué cuenta debe pagar el comprador?'
  },
  'Use practice details. The buyer will see them after escrow is locked.': {
    fr: 'Utilisez des coordonnées fictives. L’acheteur les verra après la confirmation du séquestre.',
    es: 'Usa datos de prueba. El comprador los verá cuando el bitcoin esté en garantía.'
  },
  'Use example details': { fr: 'Utiliser l’exemple', es: 'Usar datos de ejemplo' },
  'Save bank details': { fr: 'Enregistrer les coordonnées', es: 'Guardar datos bancarios' },
  'Bank details saved.': { fr: 'Coordonnées enregistrées.', es: 'Datos bancarios guardados.' },
  'Escrow deposit': { fr: 'Dépôt sous séquestre', es: 'Depósito en garantía' },
  'Escrow deposit QR': { fr: 'QR du dépôt sous séquestre', es: 'QR del depósito en garantía' },
  'Regtest only. Use this address with a Regtest wallet.': {
    fr: 'Regtest uniquement. Utilisez cette adresse avec un portefeuille Regtest.',
    es: 'Solo Regtest. Usa esta dirección con un monedero Regtest.'
  },
  'Amount to deposit': { fr: 'Montant à déposer', es: 'Importe a depositar' },
  'Copy amount': { fr: 'Copier le montant', es: 'Copiar importe' },
  'Copy payment link': { fr: 'Copier le lien de paiement', es: 'Copiar enlace de pago' },
  'Copy account holder': { fr: 'Copier le nom du titulaire', es: 'Copiar titular de la cuenta' },
  'Copy payment details': { fr: 'Copier les coordonnées de paiement', es: 'Copiar datos del pago' },
  'Payment details unavailable': {
    fr: 'Coordonnées de paiement indisponibles',
    es: 'Datos del pago no disponibles'
  },
  'Use chat to ask the seller or open Trade options for help.': {
    fr: 'Contactez le vendeur dans la discussion ou ouvrez les options de l’échange.',
    es: 'Consulta al vendedor en el chat o abre las opciones del intercambio.'
  },
  'Open Trade options to report a problem.': {
    fr: 'Ouvrez les options de l’échange pour signaler un problème.',
    es: 'Abre las opciones del intercambio para informar de un problema.'
  },
  'Jump to chat': { fr: 'Aller à la discussion', es: 'Ir al chat' },
  'Quote valid until {time}': {
    fr: 'Devis valable jusqu’à {time}',
    es: 'Cotización válida hasta las {time}'
  },
  'Checking for a saved trade…': {
    fr: 'Recherche d’un échange enregistré…',
    es: 'Buscando un intercambio guardado…'
  },
  'QR unavailable. Copy the payment link.': {
    fr: 'QR indisponible. Copiez le lien de paiement.',
    es: 'QR no disponible. Copia el enlace de pago.'
  },
  'Copy IBAN': { fr: 'Copier l’IBAN', es: 'Copiar IBAN' },
  'Copy reference': { fr: 'Copier la référence', es: 'Copiar referencia' },
  'Copied to clipboard.': { fr: 'Copié dans le presse-papiers.', es: 'Copiado al portapapeles.' },
  'Could not copy. Select the value to copy it.': {
    fr: 'Copie impossible. Sélectionnez la valeur pour la copier.',
    es: 'No se pudo copiar. Selecciona el valor para copiarlo.'
  },
  'Trade history': { fr: 'Historique des échanges', es: 'Historial de intercambios' },
  'Reconnecting to this trade…': {
    fr: 'Reconnexion à cet échange…',
    es: 'Reconectando con este intercambio…'
  },
  'Test mode. No real money.': {
    fr: 'Mode test. Aucun argent réel.',
    es: 'Modo de prueba. Sin dinero real.'
  },
  'Test deposit QR': { fr: 'QR de dépôt de test', es: 'QR de depósito de prueba' },
  'This code cannot receive bitcoin.': {
    fr: 'Ce code ne permet pas de recevoir du bitcoin.',
    es: 'Este código no puede recibir bitcoin.'
  },
  'Example bank details': {
    fr: 'Coordonnées bancaires fictives',
    es: 'Datos bancarios de ejemplo'
  },
  'Example account holder': { fr: 'Titulaire fictif', es: 'Titular de ejemplo' },
  'Example IBAN': { fr: 'IBAN fictif', es: 'IBAN de ejemplo' },
  'Payment reference': { fr: 'Référence du paiement', es: 'Referencia del pago' },
  'Use these details for practice only. Do not send money.': {
    fr: 'Utilisez ces coordonnées uniquement pour la simulation. N’envoyez pas d’argent.',
    es: 'Usa estos datos solo para practicar. No envíes dinero.'
  },
  'Groot Test Seller': { fr: 'Vendeur de test Groot', es: 'Vendedor de prueba de Groot' },
  Buy: { fr: 'Acheter', es: 'Comprar' },
  Sell: { fr: 'Vendre', es: 'Vender' },
  Account: { fr: 'Compte', es: 'Cuenta' },
  '€50–€250 · SEPA Instant': {
    fr: '50–250 € · SEPA instantané',
    es: '50–250 € · SEPA instantánea'
  },
  'Quick amounts': { fr: 'Montants rapides', es: 'Importes rápidos' },
  'Review {amount}': { fr: 'Vérifier {amount}', es: 'Revisar {amount}' },
  'Review trade': { fr: 'Vérifier l’échange', es: 'Revisar intercambio' },
  'Getting quote…': { fr: 'Recherche d’un prix…', es: 'Buscando un precio…' },
  'Fees: {amount} sats': { fr: 'Frais : {amount} sats', es: 'Comisiones: {amount} sats' },
  'Quote expired.': { fr: 'Prix expiré.', es: 'El precio caducó.' },
  'Get new quote': { fr: 'Obtenir un nouveau prix', es: 'Obtener un nuevo precio' },
  'Start trade': { fr: 'Démarrer l’échange', es: 'Iniciar intercambio' },
  'Edit amount': { fr: 'Modifier le montant', es: 'Cambiar importe' },
  'I already sent payment': { fr: 'J’ai déjà envoyé le paiement', es: 'Ya envié el pago' },
  Escrow: { fr: 'Séquestre', es: 'Garantía' },
  Receipt: { fr: 'Réception', es: 'Recepción' },
  Release: { fr: 'Libération', es: 'Liberación' },
  'Step {step} of {total}': { fr: 'Étape {step} sur {total}', es: 'Paso {step} de {total}' },
  'All steps complete': {
    fr: 'Toutes les étapes sont terminées',
    es: 'Todos los pasos completados'
  },
  'Waiting for seller': { fr: 'En attente du vendeur', es: 'Esperando al vendedor' },
  'Lock bitcoin': { fr: 'Placer le bitcoin sous séquestre', es: 'Bloquear bitcoin' },
  'Lock test bitcoin': {
    fr: 'Placer le bitcoin de test sous séquestre',
    es: 'Bloquear bitcoin de prueba'
  },
  'Simulate seller locking bitcoin': {
    fr: 'Simuler le dépôt du vendeur',
    es: 'Simular bloqueo del bitcoin por el vendedor'
  },
  'The seller locks bitcoin first. Wait for escrow before paying.': {
    fr: 'Le vendeur dépose d’abord le bitcoin. Attendez la confirmation du séquestre avant de payer.',
    es: 'El vendedor bloquea el bitcoin primero. Espera a que se confirme la garantía antes de pagar.'
  },
  'Review the amount before locking bitcoin in test escrow.': {
    fr: 'Vérifiez le montant avant de placer le bitcoin sous séquestre de test.',
    es: 'Revisa el importe antes de bloquear el bitcoin en la garantía de prueba.'
  },
  'The escrow is ready. No bank transfer is needed in this test.': {
    fr: 'Le séquestre est prêt. Aucun virement bancaire n’est nécessaire pour ce test.',
    es: 'La garantía está lista. Esta prueba no requiere una transferencia bancaria.'
  },
  'Mark payment sent': { fr: 'Indiquer le paiement envoyé', es: 'Marcar pago como enviado' },
  'In a live trade, pay the seller by SEPA Instant first. Here, just mark the payment as sent.': {
    fr: 'Pour un échange réel, payez d’abord le vendeur par virement SEPA instantané. Ici, indiquez simplement que le paiement a été envoyé.',
    es: 'En un intercambio real, paga primero al vendedor por SEPA instantánea. Aquí solo tienes que marcar el pago como enviado.'
  },
  'The buyer needs to mark the payment as sent.': {
    fr: 'L’acheteur doit indiquer que le paiement a été envoyé.',
    es: 'El comprador debe marcar el pago como enviado.'
  },
  'The seller checks the amount and sender before release.': {
    fr: 'Le vendeur vérifie le montant et l’expéditeur avant de libérer le bitcoin.',
    es: 'El vendedor comprueba el importe y el remitente antes de liberar el bitcoin.'
  },
  'The buyer marked payment as sent. Check the amount and sender before release.': {
    fr: 'L’acheteur a indiqué avoir envoyé le paiement. Vérifiez le montant et l’expéditeur avant de libérer le bitcoin.',
    es: 'El comprador ha marcado el pago como enviado. Comprueba el importe y el remitente antes de liberar el bitcoin.'
  },
  'Simulate release confirmation': {
    fr: 'Simuler la confirmation de la libération',
    es: 'Simular la confirmación de la liberación'
  },
  'The release is waiting for confirmation.': {
    fr: 'La libération attend d’être confirmée.',
    es: 'La liberación está pendiente de confirmación.'
  },
  'Release confirmed.': { fr: 'Libération confirmée.', es: 'Liberación confirmada.' },
  'Bitcoin stays in escrow until the refund confirms.': {
    fr: 'Le bitcoin reste sous séquestre jusqu’à la confirmation du remboursement.',
    es: 'El bitcoin sigue en garantía hasta que se confirme el reembolso.'
  },
  'Bitcoin returned to the seller.': {
    fr: 'Le bitcoin a été rendu au vendeur.',
    es: 'El bitcoin se devolvió al vendedor.'
  },
  'The trade ended before bitcoin was locked.': {
    fr: 'L’échange a pris fin avant le dépôt du bitcoin.',
    es: 'El intercambio terminó antes de que se bloqueara el bitcoin.'
  },
  'Test seller': { fr: 'Vendeur de test', es: 'Vendedor de prueba' },
  'Test buyer': { fr: 'Acheteur de test', es: 'Comprador de prueba' },
  'You release': { fr: 'Vous libérez', es: 'Liberas' },
  'Simulated escrow': { fr: 'Séquestre simulé', es: 'Garantía simulada' },
  'Simulated release': { fr: 'Libération simulée', es: 'Liberación simulada' },
  'Start with manual steps': { fr: 'Démarrer en mode manuel', es: 'Iniciar con pasos manuales' },
  'Secure bitcoin': { fr: 'Sécuriser le bitcoin', es: 'Asegurar el bitcoin' },
  'Send payment': { fr: 'Envoyer le paiement', es: 'Enviar el pago' },
  'Waiting for payment': { fr: 'En attente du paiement', es: 'Esperando el pago' },
  'Waiting for the seller': { fr: 'En attente du vendeur', es: 'Esperando al vendedor' },
  'Check your bank': { fr: 'Vérifiez votre banque', es: 'Comprueba tu banco' },
  'Release pending': { fr: 'Libération en attente', es: 'Liberación pendiente' },
  'Refund pending': { fr: 'Remboursement en attente', es: 'Reembolso pendiente' },
  'Trade paused': { fr: 'Échange en pause', es: 'Intercambio en pausa' },
  'This also simulates receipt and release.': {
    fr: 'La réception et la libération seront aussi simulées.',
    es: 'También se simulan la recepción y la liberación.'
  },
  'Simulate payment': { fr: 'Simuler le paiement', es: 'Simular pago' },
  'Simulate buyer payment': {
    fr: 'Simuler le paiement de l’acheteur',
    es: 'Simular pago del comprador'
  },
  'Review payment': { fr: 'Vérifier le paiement', es: 'Revisar pago' },
  'Review manual release': {
    fr: 'Vérifier avant libération manuelle',
    es: 'Revisar liberación manual'
  },
  'Check payment': { fr: 'Vérifier le paiement', es: 'Comprobar el pago' },
  'Bank receipt': { fr: 'Versement bancaire', es: 'Ingreso bancario' },
  'I checked the amount and sender.': {
    fr: 'J’ai vérifié le montant et l’expéditeur.',
    es: 'He comprobado el importe y el remitente.'
  },
  'Release test bitcoin': { fr: 'Libérer le bitcoin de test', es: 'Liberar bitcoin de prueba' },
  'No personal or bank details.': {
    fr: 'Aucune donnée personnelle ou bancaire.',
    es: 'Sin datos personales ni bancarios.'
  },
  'Retry safely. This won’t repeat the action.': {
    fr: 'Réessayez sans répéter l’action.',
    es: 'Reintenta sin repetir la acción.'
  },
  'Use 12 or more characters. Never reuse your wallet passphrase.': {
    fr: 'Utilisez au moins 12 caractères. Ne réutilisez jamais la phrase secrète de votre portefeuille.',
    es: 'Usa al menos 12 caracteres. No reutilices la frase de contraseña de tu monedero.'
  },
  'Your action was saved. Refresh status to continue.': {
    fr: 'Votre action a été enregistrée. Actualisez l’état pour continuer.',
    es: 'Tu acción se ha guardado. Actualiza el estado para continuar.'
  },
  'Bitcoin secured. Waiting for the buyer.': {
    fr: 'Bitcoin sécurisé. En attente de l’acheteur.',
    es: 'Bitcoin asegurado. Esperando al comprador.'
  },
  'Payment claimed. Check your bank.': {
    fr: 'Paiement annoncé. Vérifiez votre banque.',
    es: 'Pago anunciado. Comprueba tu banco.'
  },
  'Change amount': { fr: 'Modifier le montant', es: 'Cambiar importe' },
  'Refresh estimate': { fr: 'Actualiser l’estimation', es: 'Actualizar estimación' },
  'Trade options': { fr: 'Options de l’échange', es: 'Opciones del intercambio' },
  'Test controls': { fr: 'Commandes de test', es: 'Controles de prueba' },
  'Trade partner': { fr: 'Partenaire d’échange', es: 'Contraparte' },
  'Expected bank receipt': { fr: 'Montant attendu en banque', es: 'Ingreso bancario esperado' },
  'Bitcoin to release': { fr: 'Bitcoin à libérer', es: 'Bitcoin que se liberará' },
  'Check your test username and password, then try again.': {
    fr: 'Vérifiez votre nom d’utilisateur et votre mot de passe de test, puis réessayez.',
    es: 'Comprueba tu nombre de usuario y contraseña de prueba y vuelve a intentarlo.'
  },
  'That test username already exists. Sign in or choose another.': {
    fr: 'Ce nom d’utilisateur de test existe déjà. Connectez-vous ou choisissez-en un autre.',
    es: 'Ese nombre de usuario de prueba ya existe. Inicia sesión o elige otro.'
  },
  'Sign in': { fr: 'Se connecter', es: 'Iniciar sesión' },
  'Sign out': { fr: 'Se déconnecter', es: 'Cerrar sesión' },
  'Send message': { fr: 'Envoyer le message', es: 'Enviar mensaje' },
  'Cancel trade': { fr: 'Annuler l’échange', es: 'Cancelar intercambio' },
  'Test marketplace': { fr: 'Marché de test', es: 'Mercado de prueba' },
  'Trade with the real test service. No real money moves.': {
    fr: 'Échangez avec le véritable service de test. Aucun argent réel n’est déplacé.',
    es: 'Intercambia con el servicio de prueba real. No se mueve dinero real.'
  },
  'Test service disabled': {
    fr: 'Service de test désactivé',
    es: 'Servicio de prueba desactivado'
  },
  'Open this page with the dedicated backend test launcher.': {
    fr: 'Ouvrez cette page avec le lanceur dédié au test du service.',
    es: 'Abre esta página con el iniciador dedicado a las pruebas del servicio.'
  },
  'Server-backed sandbox': { fr: 'Simulation avec serveur', es: 'Simulación con servidor' },
  'Accounts and trades are saved by the test service. Bitcoin, payments and escrow are simulated. Never enter wallet credentials or personal bank information.':
    {
      fr: 'Le service de test enregistre les comptes et les échanges. Le bitcoin, les paiements et le séquestre sont simulés. Ne saisissez jamais les identifiants du portefeuille ni vos informations bancaires.',
      es: 'El servicio de prueba guarda las cuentas y los intercambios. El bitcoin, los pagos y la garantía son simulados. Nunca introduzcas credenciales del monedero ni datos bancarios personales.'
    },
  'Request result unknown': {
    fr: 'Résultat de la requête inconnu',
    es: 'Resultado de la solicitud desconocido'
  },
  'Retry the same request to recover its saved result without repeating the action.': {
    fr: 'Réessayez la même requête pour retrouver son résultat enregistré sans répéter l’action.',
    es: 'Reintenta la misma solicitud para recuperar su resultado guardado sin repetir la acción.'
  },
  'Retry request': { fr: 'Réessayer la requête', es: 'Reintentar solicitud' },
  'Create a test account': { fr: 'Créer un compte de test', es: 'Crear una cuenta de prueba' },
  'Create test account': { fr: 'Créer le compte de test', es: 'Crear cuenta de prueba' },
  'Test username': { fr: 'Nom d’utilisateur de test', es: 'Nombre de usuario de prueba' },
  'Test password': { fr: 'Mot de passe de test', es: 'Contraseña de prueba' },
  'Use a disposable password of at least 12 characters. Never use your wallet passphrase.': {
    fr: 'Utilisez un mot de passe jetable d’au moins 12 caractères. N’utilisez jamais la phrase secrète de votre portefeuille.',
    es: 'Usa una contraseña desechable de al menos 12 caracteres. Nunca uses la frase de contraseña de tu monedero.'
  },
  'Already have a test account?': {
    fr: 'Vous avez déjà un compte de test ?',
    es: '¿Ya tienes una cuenta de prueba?'
  },
  'Signed in to the test marketplace.': {
    fr: 'Connexion au marché de test réussie.',
    es: 'Has iniciado sesión en el mercado de prueba.'
  },
  'Signed out.': { fr: 'Déconnexion réussie.', es: 'Has cerrado sesión.' },
  'Sign in again to continue.': {
    fr: 'Reconnectez-vous pour continuer.',
    es: 'Vuelve a iniciar sesión para continuar.'
  },
  'The trade changed. Refresh its status before continuing.': {
    fr: 'L’échange a changé. Actualisez son état avant de continuer.',
    es: 'El intercambio ha cambiado. Actualiza su estado antes de continuar.'
  },
  'This action is not available to your account.': {
    fr: 'Cette action n’est pas disponible pour votre compte.',
    es: 'Esta acción no está disponible para tu cuenta.'
  },
  'Too many requests. Wait a minute before trying again.': {
    fr: 'Trop de requêtes. Attendez une minute avant de réessayer.',
    es: 'Demasiadas solicitudes. Espera un minuto antes de reintentarlo.'
  },
  'Check the entered details and try again.': {
    fr: 'Vérifiez les informations saisies et réessayez.',
    es: 'Comprueba los datos introducidos y vuelve a intentarlo.'
  },
  'The test service is unavailable. Your saved trades are kept.': {
    fr: 'Le service de test est indisponible. Vos échanges enregistrés sont conservés.',
    es: 'El servicio de prueba no está disponible. Tus intercambios guardados se conservan.'
  },
  'Trade status saved.': {
    fr: 'État de l’échange enregistré.',
    es: 'Estado del intercambio guardado.'
  },
  'Request recovered. No duplicate action was created.': {
    fr: 'Requête récupérée. Aucune action n’a été créée en double.',
    es: 'Solicitud recuperada. No se ha duplicado ninguna acción.'
  },
  'Fee details': { fr: 'Détail des frais', es: 'Detalle de comisiones' },
  'Platform fee': { fr: 'Frais de plateforme', es: 'Comisión de plataforma' },
  'Funding fee': { fr: 'Frais de dépôt', es: 'Comisión de depósito' },
  'Release fee': { fr: 'Frais de libération', es: 'Comisión de liberación' },
  'Start saved test trade': {
    fr: 'Démarrer un échange de test enregistré',
    es: 'Iniciar intercambio de prueba guardado'
  },
  'Simulate confirmed escrow': {
    fr: 'Simuler un dépôt sous séquestre confirmé',
    es: 'Simular depósito en garantía confirmado'
  },
  'Mark demo payment as sent': {
    fr: 'Marquer le paiement fictif comme envoyé',
    es: 'Marcar pago de demostración como enviado'
  },
  'Simulate buyer payment claim': {
    fr: 'Simuler l’annonce de paiement de l’acheteur',
    es: 'Simular aviso de pago del comprador'
  },
  'A payment claim is not proof of bank receipt.': {
    fr: 'Une annonce de paiement ne prouve pas sa réception en banque.',
    es: 'Un aviso de pago no demuestra su recepción en el banco.'
  },
  'Simulate seller receipt': {
    fr: 'Simuler la réception par le vendeur',
    es: 'Simular recepción del vendedor'
  },
  'Simulate release and confirmation': {
    fr: 'Simuler la libération et sa confirmation',
    es: 'Simular liberación y confirmación'
  },
  'Simulate confirmed refund': {
    fr: 'Simuler un remboursement confirmé',
    es: 'Simular reembolso confirmado'
  },
  'Simulate late payment claim': {
    fr: 'Simuler une annonce de paiement tardive',
    es: 'Simular aviso de pago tardío'
  },
  'Release is paused. This is a saved test dispute; no real support request was sent.': {
    fr: 'La libération est suspendue. Il s’agit d’un litige de test enregistré ; aucune demande d’assistance réelle n’a été envoyée.',
    es: 'La liberación está pausada. Es una disputa de prueba guardada; no se ha enviado ninguna solicitud de asistencia real.'
  },
  'Simulate dispute refund decision': {
    fr: 'Simuler une décision de remboursement du litige',
    es: 'Simular decisión de reembolso de la disputa'
  },
  'Simulate dispute release decision': {
    fr: 'Simuler une décision de libération du litige',
    es: 'Simular decisión de liberación de la disputa'
  },
  'Saved test outcome. No money moved.': {
    fr: 'Résultat du test enregistré. Aucun argent déplacé.',
    es: 'Resultado de prueba guardado. No se ha movido dinero.'
  },
  'Refresh status': { fr: 'Actualiser l’état', es: 'Actualizar estado' },
  'Trade chat': { fr: 'Discussion de l’échange', es: 'Chat del intercambio' },
  'Trade tools': { fr: 'Outils de l’échange', es: 'Herramientas del intercambio' },
  'No messages yet.': { fr: 'Aucun message pour le moment.', es: 'Aún no hay mensajes.' },
  You: { fr: 'Vous', es: 'Tú' },
  'Chat saved with this trade.': {
    fr: 'Discussion enregistrée avec cet échange.',
    es: 'Chat guardado con este intercambio.'
  },
  'Chat messages are saved with this trade.': {
    fr: 'Les messages sont enregistrés avec cet échange.',
    es: 'Los mensajes se guardan con este intercambio.'
  },
  'Refresh chat': { fr: 'Actualiser la discussion', es: 'Actualizar chat' },
  'Trade activity': { fr: 'Activité de l’échange', es: 'Actividad del intercambio' },
  'Trade started': { fr: 'Échange démarré', es: 'Intercambio iniciado' },
  'Bitcoin locked in test escrow': {
    fr: 'Bitcoin placé sous séquestre de test',
    es: 'Bitcoin bloqueado en garantía de prueba'
  },
  'Buyer marked payment sent': {
    fr: 'Paiement marqué comme envoyé par l’acheteur',
    es: 'El comprador marcó el pago como enviado'
  },
  'Seller confirmed receipt': {
    fr: 'Réception confirmée par le vendeur',
    es: 'El vendedor confirmó la recepción'
  },
  'Bitcoin released': { fr: 'Bitcoin libéré', es: 'Bitcoin liberado' },
  'Test dispute resolved for refund': {
    fr: 'Remboursement décidé après un litige de test',
    es: 'Reembolso decidido tras una disputa de prueba'
  },
  'Test dispute resolved for release': {
    fr: 'Libération décidée après un litige de test',
    es: 'Liberación decidida tras una disputa de prueba'
  },
  'Trade updated': { fr: 'Échange mis à jour', es: 'Intercambio actualizado' },
  'Trade messages': { fr: 'Messages de l’échange', es: 'Mensajes del intercambio' },
  'Test message': { fr: 'Message de test', es: 'Mensaje de prueba' },
  'Message saved.': { fr: 'Message enregistré.', es: 'Mensaje guardado.' },
  'Saved event history': {
    fr: 'Historique des événements enregistré',
    es: 'Historial de eventos guardado'
  },
  'Saved trades': { fr: 'Échanges enregistrés', es: 'Intercambios guardados' },
  'This is a simulation. A real seller must check the exact payment in their own bank before authorizing release.':
    {
      fr: 'Ceci est une simulation. Pour un échange réel, le vendeur doit vérifier le paiement exact dans sa propre banque avant d’autoriser la libération.',
      es: 'Es una simulación. En un intercambio real, el vendedor debe comprobar el pago exacto en su propio banco antes de autorizar la liberación.'
    },
  'I understand that a payment claim is not proof of receipt.': {
    fr: 'Je comprends qu’une annonce de paiement ne prouve pas sa réception.',
    es: 'Entiendo que un aviso de pago no demuestra su recepción.'
  },
  'Confirm demo receipt and release': {
    fr: 'Confirmer la réception fictive et libérer',
    es: 'Confirmar recepción de demostración y liberar'
  }
} satisfies CatalogSection;

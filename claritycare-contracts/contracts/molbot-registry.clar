;; Molbot Registry onchain service catalog for agent-to-agent commerce
;;
;; Molbots register their services (endpoint, price, capabilities).
;; Other molbots discover services by querying on-chain.
;;
;; Part of the StacksCare Molbot Commerce Protocol.

;; ===========================
;; CONSTANTS & ERROR CODES
;; ===========================

(define-constant ERR-NOT-OWNER (err u200))
(define-constant ERR-AGENT-NOT-FOUND (err u201))
(define-constant ERR-ALREADY-REGISTERED (err u202))
(define-constant ERR-INVALID-INPUT (err u203))
(define-constant ERR-LIST-FULL (err u204))

;; Maximum number of agents tracked in the global index
(define-constant MAX-AGENTS u50)

;; ===========================
;; DATA VARS
;; ===========================

;; Auto-incrementing global agent ID counter
(define-data-var agent-counter uint u0)

;; ===========================
;; DATA MAPS
;; ===========================

;; Core agent storage: agent-id -> agent data
(define-map agents
  { agent-id: uint }
  {
    owner: principal,
    name: (string-ascii 50),
    endpoint-url: (string-ascii 200),
    service-type: (string-ascii 50),
    price-ustx: uint,
    token-type: (string-ascii 10),
    active: bool,
    registered-at: uint
  }
)

;; Reverse lookup: owner principal -> agent-id (one agent per principal)
(define-map owner-agent
  { owner: principal }
  { agent-id: uint }
)

;; Global ordered list of agent IDs (for enumeration)
(define-map agent-index
  { idx: uint }
  { agent-id: uint }
)

;; ===========================
;; PUBLIC WRITE FUNCTIONS
;; ===========================

;; Register a new molbot agent. Caller becomes the owner.
;; Each principal can only register one agent.
(define-public (register-agent
    (name (string-ascii 50))
    (endpoint-url (string-ascii 200))
    (service-type (string-ascii 50))
    (price-ustx uint)
    (token-type (string-ascii 10)))
  (let (
    (caller tx-sender)
    (existing (map-get? owner-agent { owner: caller }))
    (new-id (+ (var-get agent-counter) u1))
  )
    ;; Validate inputs
    (asserts! (> (len name) u0) ERR-INVALID-INPUT)
    (asserts! (> (len endpoint-url) u0) ERR-INVALID-INPUT)
    (asserts! (> (len service-type) u0) ERR-INVALID-INPUT)
    (asserts! (> (len token-type) u0) ERR-INVALID-INPUT)

    ;; One agent per principal
    (asserts! (is-none existing) ERR-ALREADY-REGISTERED)

    ;; Check capacity
    (asserts! (< (var-get agent-counter) MAX-AGENTS) ERR-LIST-FULL)

    ;; Store agent
    (map-set agents
      { agent-id: new-id }
      {
        owner: caller,
        name: name,
        endpoint-url: endpoint-url,
        service-type: service-type,
        price-ustx: price-ustx,
        token-type: token-type,
        active: true,
        registered-at: stacks-block-height
      }
    )

    ;; Reverse lookup
    (map-set owner-agent { owner: caller } { agent-id: new-id })

    ;; Global index
    (map-set agent-index { idx: new-id } { agent-id: new-id })

    ;; Increment counter
    (var-set agent-counter new-id)

    ;; Emit event for off-chain indexers
    (print {
      event: "agent-registered",
      agent-id: new-id,
      owner: caller,
      name: name,
      service-type: service-type,
      price-ustx: price-ustx
    })

    (ok new-id)
  )
)

;; Update an existing agent's endpoint and price. Only the owner can update.
(define-public (update-agent
    (agent-id uint)
    (endpoint-url (string-ascii 200))
    (price-ustx uint))
  (let (
    (agent (unwrap! (map-get? agents { agent-id: agent-id }) ERR-AGENT-NOT-FOUND))
  )
    (asserts! (is-eq (get owner agent) tx-sender) ERR-NOT-OWNER)
    (asserts! (> (len endpoint-url) u0) ERR-INVALID-INPUT)

    (map-set agents
      { agent-id: agent-id }
      (merge agent {
        endpoint-url: endpoint-url,
        price-ustx: price-ustx
      })
    )

    ;; Emit event for off-chain indexers
    (print {
      event: "agent-updated",
      agent-id: agent-id,
      owner: tx-sender,
      endpoint-url: endpoint-url,
      price-ustx: price-ustx
    })

    (ok true)
  )
)

;; Deactivate an agent. Only the owner can deactivate.
(define-public (deregister-agent (agent-id uint))
  (let (
    (agent (unwrap! (map-get? agents { agent-id: agent-id }) ERR-AGENT-NOT-FOUND))
  )
    (asserts! (is-eq (get owner agent) tx-sender) ERR-NOT-OWNER)

    (map-set agents
      { agent-id: agent-id }
      (merge agent { active: false })
    )

    ;; Emit event for off-chain indexers
    (print {
      event: "agent-deregistered",
      agent-id: agent-id,
      owner: tx-sender
    })

    (ok true)
  )
)

;; ===========================
;; READ-ONLY FUNCTIONS
;; ===========================

;; Get agent by ID
(define-read-only (get-agent (agent-id uint))
  (match (map-get? agents { agent-id: agent-id })
    agent (ok agent)
    ERR-AGENT-NOT-FOUND
  )
)

;; Get agent ID by owner principal
(define-read-only (get-agent-by-owner (owner principal))
  (match (map-get? owner-agent { owner: owner })
    entry (match (map-get? agents { agent-id: (get agent-id entry) })
      agent (ok (merge agent { agent-id: (get agent-id entry) }))
      ERR-AGENT-NOT-FOUND
    )
    ERR-AGENT-NOT-FOUND
  )
)

;; Get total number of registered agents
(define-read-only (get-agent-count)
  (var-get agent-counter)
)

;; Check if a specific agent is active
(define-read-only (is-agent-active (agent-id uint))
  (match (map-get? agents { agent-id: agent-id })
    agent (get active agent)
    false
  )
)

;; StacksCare - Programmable Health Data Ownership
;; Patient-owned medical records with permissioned access on Stacks
;;
;; References:
;;   - Clarity Language Spec: https://docs.stacks.co/clarity/overview
;;   - Clarity Best Practices: https://book.clarity-lang.org/
;;   - Clarinet SDK Docs: https://docs.hiro.so/stacks/clarinet-js-sdk

;; ===========================
;; CONSTANTS & ERROR CODES
;; ===========================

(define-constant ERR-NOT-OWNER (err u100))
(define-constant ERR-NOT-AUTHORIZED (err u101))
(define-constant ERR-RECORD-NOT-FOUND (err u102))
(define-constant ERR-INVALID-INPUT (err u103))
(define-constant ERR-LIST-FULL (err u104))
(define-constant ERR-SELF-GRANT (err u105))

;; ===========================
;; DATA VARS
;; ===========================

;; Auto-incrementing global record ID counter
(define-data-var record-counter uint u0)

;; ===========================
;; DATA MAPS
;; ===========================

;; Core health record storage: record-id -> record data
(define-map health-records
  { record-id: uint }
  {
    owner: principal,
    ipfs-hash: (string-ascii 100),
    record-type: (string-ascii 50),
    timestamp: uint
  }
)

;; Permission map: (record-id, doctor) -> authorized + block granted
(define-map record-permissions
  { record-id: uint, doctor: principal }
  { authorized: bool, granted-at: uint }
)

;; Index: patient address -> ordered list of their record IDs (max 50)
(define-map patient-record-index
  { owner: principal }
  { record-ids: (list 50 uint) }
)

;; ===========================
;; PUBLIC WRITE FUNCTIONS
;; ===========================

;; Create a new health record. Caller becomes the owner.
;; - ipfs-hash: CIDv0/CIDv1 of the encrypted file stored on IPFS
;; - record-type: e.g. "consultation" | "lab_result" | "prescription" | "imaging" | "other"
;; Returns: (ok record-id) on success
(define-public (create-record
    (ipfs-hash (string-ascii 100))
    (record-type (string-ascii 50)))
  (let (
    (new-id (+ (var-get record-counter) u1))
    (caller tx-sender)
    (current-index (default-to { record-ids: (list) }
                    (map-get? patient-record-index { owner: caller })))
    (updated-ids (unwrap! (as-max-len?
                    (append (get record-ids current-index) new-id)
                    u50)
                  ERR-LIST-FULL))
  )
    (asserts! (> (len ipfs-hash) u0) ERR-INVALID-INPUT)
    (asserts! (> (len record-type) u0) ERR-INVALID-INPUT)

    (map-set health-records
      { record-id: new-id }
      {
        owner: caller,
        ipfs-hash: ipfs-hash,
        record-type: record-type,
        timestamp: stacks-block-height
      }
    )

    (map-set patient-record-index
      { owner: caller }
      { record-ids: updated-ids }
    )

    (var-set record-counter new-id)

    ;; Emit event for off-chain indexers
    (print {
      event: "record-created",
      record-id: new-id,
      owner: caller,
      record-type: record-type,
      ipfs-hash: ipfs-hash,
      timestamp: stacks-block-height
    })

    (ok new-id)
  )
)

;; Grant a doctor principal read access to a specific record.
;; Only the record owner can call this.
;; Returns: (ok true) on success
(define-public (grant-access
    (record-id uint)
    (doctor principal))
  (let (
    (record (unwrap! (map-get? health-records { record-id: record-id })
              ERR-RECORD-NOT-FOUND))
  )
    (asserts! (is-eq (get owner record) tx-sender) ERR-NOT-OWNER)
    (asserts! (not (is-eq doctor tx-sender)) ERR-SELF-GRANT)

    (map-set record-permissions
      { record-id: record-id, doctor: doctor }
      { authorized: true, granted-at: stacks-block-height }
    )

    ;; Emit event for off-chain indexers
    (print {
      event: "access-granted",
      record-id: record-id,
      doctor: doctor,
      owner: tx-sender,
      granted-at: stacks-block-height
    })

    (ok true)
  )
)

;; Revoke a previously granted access. Only the owner can revoke.
;; Returns: (ok true) on success
(define-public (revoke-access
    (record-id uint)
    (doctor principal))
  (let (
    (record (unwrap! (map-get? health-records { record-id: record-id })
              ERR-RECORD-NOT-FOUND))
  )
    (asserts! (is-eq (get owner record) tx-sender) ERR-NOT-OWNER)

    (map-delete record-permissions
      { record-id: record-id, doctor: doctor }
    )

    ;; Emit event for off-chain indexers
    (print {
      event: "access-revoked",
      record-id: record-id,
      doctor: doctor,
      owner: tx-sender
    })

    (ok true)
  )
)

;; ===========================
;; READ-ONLY FUNCTIONS
;; ===========================

;; Get full record data.
;; Caller must be the owner or an authorized doctor.
(define-read-only (get-record (record-id uint))
  (let (
    (record (unwrap! (map-get? health-records { record-id: record-id })
              ERR-RECORD-NOT-FOUND))
    (caller tx-sender)
    (perm (map-get? record-permissions { record-id: record-id, doctor: caller }))
  )
    (asserts!
      (or
        (is-eq (get owner record) caller)
        (default-to false (get authorized perm))
      )
      ERR-NOT-AUTHORIZED
    )
    (ok record)
  )
)

;; Get the list of record IDs owned by a patient.
;; IDs alone reveal no sensitive data; content requires IPFS + decryption key.
(define-read-only (get-patient-record-ids (patient principal))
  (get record-ids
    (default-to { record-ids: (list) }
      (map-get? patient-record-index { owner: patient })))
)

;; Check whether a doctor is currently authorized for a record.
(define-read-only (is-authorized (record-id uint) (doctor principal))
  (default-to false
    (get authorized
      (map-get? record-permissions { record-id: record-id, doctor: doctor })))
)

;; Public record verification - returns non-sensitive metadata only.
;; Useful for audit proofs without exposing IPFS content or patient data.
(define-read-only (verify-record (record-id uint))
  (match (map-get? health-records { record-id: record-id })
    record (ok {
      owner: (get owner record),
      record-type: (get record-type record),
      timestamp: (get timestamp record)
    })
    ERR-RECORD-NOT-FOUND
  )
)

;; Get the total number of health records ever created across all patients.
(define-read-only (get-total-records)
  (var-get record-counter)
)

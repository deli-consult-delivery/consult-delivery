# iFood Developer — API Reference completa (capturada do portal logado, 2026-06-27)
Fonte: https://developer.ifood.com.br/pt-BR/docs/references — conta Wandson França da Silva (acesso "Super integradoras")
Base host de TODAS as APIs: https://merchant-api.ifood.com.br

## Authentication — /authentication/v1.0
- POST /oauth/userCode — Requests a user code
- POST /oauth/token — Requests an access token

## Merchant — /merchant/v1.0
- GET /merchants — List merchants
- GET /merchants/{merchantId} — Get merchant details
- GET /merchants/{merchantId}/status — Get merchant status
- GET /merchants/{merchantId}/status/{operation} — Get merchant status by operation
- GET /merchants/{merchantId}/interruptions — List merchant's interruptions
- POST /merchants/{merchantId}/interruptions — Create an interruption
- DELETE /merchants/{merchantId}/interruptions/{interruptionId} — Delete an interruption
- GET /merchants/{merchantId}/opening-hours — Get opening hours
- PUT /merchants/{merchantId}/opening-hours — Create an opening hours
- POST /merchants/checkin-qrcode — Generate check-in QR code PDF file

## Events — /events/v1.0
- GET /events:polling — Get New Events
- POST /events/acknowledgment — Acknowledge Events

## Order — /order/v1.0
- GET /orders/{id} — Get Order Details
- GET /orders/{id}/virtual-bag — Get Order Virtual Bag
- POST /orders/{id}/confirm — Confirm an order
- POST /orders/{id}/startPreparation — Start Preparation
- POST /orders/{id}/readyToPickup — Ready to Pickup
- POST /orders/{id}/dispatch — Dispatch an order
- GET /orders/{id}/cancellationReasons — Get available cancellation codes
- POST /orders/{id}/requestCancellation — Request to cancel
- GET /orders/{id}/tracking — Track the order
- POST /disputes/{disputeId}/accept — Accept a dispute (Handshake)
- POST /disputes/{disputeId}/reject — Reject a Handshake Dispute
- POST /disputes/{disputeId}/alternatives/{alternativeId} — Send a proposal
- POST /orders/{id}/validatePickupCode — Send pickup verification code
- POST /orders/{id}/verifyDeliveryCode — Send delivery verification code

## Logistics — /logistics/v1.0 (entrega própria via iFood)
- GET /orders/{id} — Get Logistics Order Details
- POST /orders/{id}/assignDriver | goingToOrigin | arrivedAtOrigin | dispatch | arrivedAtDestination
- POST /orders/{id}/verifyDeliveryCode

## Preparation (myPreparationTime) — /merchant/v1.0/merchants/{merchantId}/myPreparationTime
- GET/POST/PUT/DELETE myPreparationTime (corpo = inteiro JSON puro de minutos, 5-70; header X-iFood-Customer-ID obrigatório; rate 100/60s)

## Shipping — /shipping/v1.0 (pedidos de canais próprios → entrega iFood)
- GET /merchants/{merchantId}/deliveryAvailabilities | GET /orders/{orderId}/deliveryAvailabilities
- POST /merchants/{merchantId}/orders (request driver external) | POST /orders/{orderId}/requestDriver
- Delivery Address: accept/request/deny change, userConfirmAddress
- Cancellation: cancellationReasons, cancel, cancelRequestDriver
- GET /orders/{orderId}/safeDelivery — Safe Delivery Score
- GET /orders/{id}/tracking

## Catalog — /catalog/v2.0 (v1.0 legado) — CARDÁPIO
### Catalog
- GET /merchants/{merchantId}/catalogs — List catalogs
- GET /merchants/{merchantId}/catalogs/{catalogId}/unsellableItems — List unsellable items
- GET /merchants/{merchantId}/catalogs/{groupId}/sellableItems — List sellable items
- GET /merchants/{merchantId}/catalog/version — Check Version
### Category
- GET/POST /merchants/{merchantId}/catalogs/{catalogId}/categories — List/Create
- GET/PATCH /merchants/{merchantId}/catalogs/{catalogId}/categories/{categoryId} — Get/Edit
- GET /merchants/{merchantId}/categories/{categoryId}/items — List items in category
- DELETE /merchants/{merchantId}/categories/{categoryId} — Delete category
### Product
- GET /merchants/{merchantId}/products — List products
- POST /merchants/{merchantId}/products — Create a product
- PUT /merchants/{merchantId}/products/{productId} — Edit a product
- DELETE /merchants/{merchantId}/products/{productId} — Delete a product
- PATCH /merchants/{merchantId}/products/{productId} — Partial update (JSON Merge Patch)
- PATCH /merchants/{merchantId}/products/status — Batch update products' statuses (PAUSAR EM LOTE)
- PATCH /merchants/{merchantId}/products/price — Batch update product's prices
- GET /merchants/{merchantId}/products/externalCode/{externalCode} — List by external code
- GET /merchants/{merchantId}/product/{productId} — Get product by id
### Item
- DELETE /merchants/{merchantId}/categories/{categoryId}/products/{productId} — Delete an item
- GET /merchants/{merchantId}/items/{itemId}/flat — Get item flat
- PUT /merchants/{merchantId}/items — Create or update an item
- PATCH /merchants/{merchantId}/items/{itemId} — Partial update item (JSON Merge Patch) — PAUSAR/PRECO/STATUS (endpoint atual; os /items/price /items/status /items/externalCode estão deprecados em favor deste)
### Option Group / Option (complementos)
- GET/PATCH/DELETE option groups; create/delete/update options; PATCH options/price, options/status
### Batch / Inventory / Image / Version
- GET /merchants/{merchantId}/batch/{batchId} — List batch operation results
- POST /merchants/{merchantId}/inventory — Create/update stock
- GET /merchants/{merchantId}/inventory/{productId} — Get stock
- POST inventory/batchFetch | inventory/batchDelete
- POST /merchants/{merchantId}/image/upload — Upload image
- POST /merchants/{merchantId}/version/upgrade|downgrade — Catalog v2/v1

## Financial — /financial/v3.0 (v2.0, v2.1 legados)
- GET /merchants/{merchantId}/reconciliation — Get reconciliation
- GET /merchants/{merchantId}/settlements — Get Settlements
- GET /merchants/{merchantId}/anticipations — Get Anticipations
- GET /merchants/{merchantId}/sales — Get Sales (VENDAS)
- GET /merchants/{merchantId}/financial-events — Get Financial Events
- POST /merchants/{merchantId}/reconciliation/on-demand — Generate reconciliation file on demand
- GET /merchants/{merchantId}/reconciliation/on-demand/{requestId} — Fetch file by request id

## Review — /review/v2.0 (v1.0 legado)
- GET /merchants/{merchantId}/reviews — List reviews
- GET /merchants/{merchantId}/reviews/{reviewId} — Get a review
- POST /merchants/{merchantId}/reviews/{reviewId}/answers — Post a reply
- GET /merchants/{merchantId}/summary — Get a summary (count, average score)

## Picking — /picking/v1.0 (MERCADO/groceries — fora do escopo restaurante)
- Order Modifiers (add/replace/modify/remove item), Order Actions (start/end separation)

## Item — /item/v1.0 (MERCADO/groceries — fora do escopo restaurante)
- POST /ingestion/{merchantId}?reset={resetCatalog} — Post Item Integration
- PATCH /ingestion/{merchantId} — Patch Item Integration

package com.saku.umkm

import android.util.Base64
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.util.UUID
import java.util.concurrent.TimeUnit
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody

class ApiException(val code: String, val status: Int = 0) : Exception(code)

class SakuApi(private val sessions: SecureSessionStore) {
    private val jsonMedia = "application/json; charset=utf-8".toMediaType()
    private val http = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .writeTimeout(20, TimeUnit.SECONDS)
        .build()

    @Volatile private var accessToken: String? = null
    @Volatile var user: SakuUser? = null
        private set

    private val coreBase: String get() = BuildConfig.SAKU_API_BASE_URL.trimEnd('/')

    fun configured(): Boolean = EndpointPolicy.approved(BuildConfig.SAKU_ENVIRONMENT, coreBase)

    suspend fun restore(): Boolean = withContext(Dispatchers.IO) {
        retryPendingRevocation()
        val refresh = sessions.load() ?: return@withContext false
        runCatching { refresh(refresh); true }.getOrElse { sessions.clear(); accessToken = null; user = null; false }
    }

    suspend fun login(email: String, password: String): Session = withContext(Dispatchers.IO) {
        val body = JSONObject().put("email", email.trim()).put("password", password)
        acceptSession(requestObject("/api/auth/login", "POST", body, auth = false, retry = false))
    }

    suspend fun register(name: String, businessName: String, email: String, password: String): Session = withContext(Dispatchers.IO) {
        val body = JSONObject().put("name", name.trim()).put("businessName", businessName.trim()).put("email", email.trim()).put("password", password)
        acceptSession(requestObject("/api/auth/register", "POST", body, auth = false, retry = false))
    }

    private fun acceptSession(o: JSONObject): Session {
        val u = parseUser(o.getJSONObject("user"))
        val session = Session(o.getString("accessToken"), o.getString("refreshToken"), u)
        accessToken = session.accessToken; user = u; sessions.save(session.refreshToken); return session
    }

    private fun refresh(refreshToken: String) {
        val o = requestObjectBlocking(coreBase, "/api/auth/refresh", "POST", JSONObject().put("refreshToken", refreshToken), auth = false, retry = false)
        acceptSession(o)
    }

    suspend fun logout(): Boolean = withContext(Dispatchers.IO) {
        val refresh = sessions.load()
        val revoked = refresh == null || runCatching {
            requestObjectBlocking(coreBase, "/api/auth/logout", "POST", JSONObject().put("refreshToken", refresh), false, false)
        }.isSuccess
        if (!revoked && refresh != null) sessions.savePendingRevocation(refresh) else sessions.clearPendingRevocation()
        sessions.clear(); accessToken = null; user = null
        revoked
    }

    private fun retryPendingRevocation() {
        val pending = sessions.loadPendingRevocation() ?: return
        val revoked = runCatching {
            requestObjectBlocking(coreBase, "/api/auth/logout", "POST", JSONObject().put("refreshToken", pending), false, false)
        }.isSuccess
        if (revoked) sessions.clearPendingRevocation()
    }

    suspend fun onboardingState(): OnboardingState = withContext(Dispatchers.IO) { parseOnboarding(requestObjectBlocking(coreBase, "/api/onboarding/state", "GET", null, true, true)) }

    suspend fun saveOnboarding(step: String, data: JSONObject = JSONObject(), countryCode: String? = null): OnboardingState = withContext(Dispatchers.IO) {
        val body = JSONObject().put("step", step).put("data", data); countryCode?.let { body.put("countryCode", it) }
        parseOnboarding(requestObjectBlocking(coreBase, "/api/onboarding/state", "PATCH", body, true, true))
    }

    suspend fun completeOnboarding(state: OnboardingState): OnboardingState = withContext(Dispatchers.IO) {
        val primary = state.primary ?: throw ApiException("PRIMARY_CLASSIFICATION_REQUIRED", 400)
        val business = JSONObject().put("name", state.business.name).put("phoneNumber", state.business.phoneNumber.ifBlank { JSONObject.NULL }).put("address", state.business.address.ifBlank { JSONObject.NULL }).put("bio", state.business.bio.ifBlank { JSONObject.NULL })
        val owner = JSONObject().put("name", state.owner.name)
        val body = JSONObject().put("countryCode", state.countryCode ?: "ID").put("business", business).put("owner", owner).put("primaryClassification", classificationJson(primary)).put("secondaryClassifications", JSONArray().apply { state.secondary.take(8).forEach { put(classificationJson(it)) } }).put("consents", JSONObject().put("terms", true).put("privacy", true))
        parseOnboarding(requestObjectBlocking(coreBase, "/api/onboarding/complete", "POST", body, true, true))
    }

    suspend fun searchKbli(query: String): List<KbliEntry> = withContext(Dispatchers.IO) {
        if (query.trim().isEmpty()) return@withContext emptyList()
        val q = URLEncoder.encode(query.trim(), StandardCharsets.UTF_8.toString())
        val data = requestObjectBlocking(coreBase, "/api/reference/kbli/search?q=$q&region=DIY&limit=30", "GET", null, true, true)
        val arr = data.optJSONArray("results") ?: JSONArray()
        List(boundedCollectionSize(arr.length())) { i -> val o = arr.getJSONObject(i); KbliEntry(o.str("code"), o.str("title"), o.optString("description", "Klasifikasi resmi KBLI 2025")) }
    }

    suspend fun snapshot(): AppSnapshot = withContext(Dispatchers.IO) {
        val merchant = merchant(); val products = products(); val dashboard = dashboard(); val report = runCatching { report("daily") }.getOrNull(); val top = runCatching { topProducts() }.getOrDefault(emptyList())
        AppSnapshot(user ?: SakuUser("", "Pemilik", ""), merchant, dashboard, products, report, top)
    }

    suspend fun merchant(): Merchant = withContext(Dispatchers.IO) { parseMerchant(requestObjectBlocking(coreBase, "/api/merchant/me", "GET", null, true, true)) }

    suspend fun updateMerchant(name: String, category: String, phone: String, address: String, bio: String): Merchant = withContext(Dispatchers.IO) {
        val body = JSONObject().put("name", name.trim()).put("businessCategory", category.trim()).put("phoneNumber", phone.ifBlank { JSONObject.NULL }).put("address", address.ifBlank { JSONObject.NULL }).put("businessBio", bio.ifBlank { JSONObject.NULL })
        requestObjectBlocking(coreBase, "/api/merchant/me", "PATCH", body, true, true); merchant()
    }

    suspend fun changePassword(current: String, next: String) = withContext(Dispatchers.IO) { requestObjectBlocking(coreBase, "/api/merchant/change-password", "POST", JSONObject().put("currentPassword", current).put("newPassword", next), true, true) }

    suspend fun products(): List<Product> = withContext(Dispatchers.IO) { val arr = requestArrayBlocking(coreBase, "/api/products", "GET", null, true, true); List(boundedCollectionSize(arr.length())) { parseProduct(arr.getJSONObject(it)) } }

    suspend fun createProduct(name: String, buyPrice: Long, sellPrice: Long, stock: Int, minStock: Int, imageBytes: ByteArray, mime: String): Product = withContext(Dispatchers.IO) {
        val created = parseProduct(requestObjectBlocking(coreBase, "/api/products", "POST", productPayload(name, buyPrice, sellPrice, stock, minStock), true, true))
        try { uploadProductImage(created.id, imageBytes, mime) } catch (e: Exception) { runCatching { requestObjectBlocking(coreBase, "/api/products/${created.id}", "DELETE", null, true, true) }; throw e }
        products().firstOrNull { it.id == created.id } ?: created
    }

    suspend fun updateProduct(id: String, name: String, buyPrice: Long, sellPrice: Long, stock: Int, minStock: Int, imageBytes: ByteArray?, mime: String?): Product = withContext(Dispatchers.IO) {
        val updated = parseProduct(requestObjectBlocking(coreBase, "/api/products/$id", "PATCH", productPayload(name, buyPrice, sellPrice, stock, minStock), true, true))
        if (imageBytes != null && mime != null) uploadProductImage(id, imageBytes, mime)
        products().firstOrNull { it.id == id } ?: updated
    }

    suspend fun deleteProduct(id: String) = withContext(Dispatchers.IO) { requestObjectBlocking(coreBase, "/api/products/$id", "DELETE", null, true, true) }

    private fun uploadProductImage(id: String, bytes: ByteArray, mime: String) {
        require(bytes.size <= 6 * 1024 * 1024) { "IMAGE_TOO_LARGE" }
        requestObjectBlocking(coreBase, "/api/media/product/$id/upload-inline", "POST", JSONObject().put("contentType", mime).put("dataBase64", Base64.encodeToString(bytes, Base64.NO_WRAP)), true, true)
    }

    suspend fun dashboard(): Dashboard = withContext(Dispatchers.IO) { parseDashboard(requestObjectBlocking(coreBase, "/api/merchant/dashboard", "GET", null, true, true)) }
    suspend fun report(period: String): Report = withContext(Dispatchers.IO) { parseReport(period, requestObjectBlocking(coreBase, "/api/merchant/report?period=$period", "GET", null, true, true)) }
    suspend fun expenses(): List<Expense> = withContext(Dispatchers.IO) { val arr = requestArrayBlocking(coreBase, "/api/merchant/expenses", "GET", null, true, true); List(boundedCollectionSize(arr.length())) { i -> val o=arr.getJSONObject(i); Expense(o.str("id"), o.str("description"), o.str("category"), o.long("amount")) } }
    suspend fun addExpense(description: String, category: String, amount: Long) = withContext(Dispatchers.IO) { requestObjectBlocking(coreBase, "/api/merchant/expenses", "POST", JSONObject().put("description", description).put("category", category).put("amount", amount), true, true) }

    suspend fun checkout(items: Map<String, Int>, paymentMethod: String): CheckoutResult = withContext(Dispatchers.IO) {
        val arr = JSONArray(); items.filterValues { it > 0 }.forEach { (id,q) -> arr.put(JSONObject().put("productId", id).put("quantity", q)) }
        if (arr.length() == 0) throw ApiException("CART_EMPTY", 400)
        val body = JSONObject().put("idempotencyKey", UUID.randomUUID().toString()).put("paymentMethod", paymentMethod).put("items", arr)
        CheckoutResult(requestObjectBlocking(coreBase, "/api/checkout", "POST", body, true, true).optString("invoiceNumber", ""))
    }

    suspend fun topProducts(): List<TopProduct> = withContext(Dispatchers.IO) {
        val data = requestObjectBlocking(coreBase, "/api/analytics/product-sales?period=daily", "GET", null, true, true)
        val arr = data.optJSONArray("topByQuantity") ?: data.optJSONArray("items") ?: JSONArray(); val size = minOf(3, arr.length())
        List(size) { i -> val o=arr.getJSONObject(i); TopProduct(o.str("productId"), o.str("name"), o.int("quantitySold"), o.long("grossSales"), o.optString("imageAssetId", "").takeIf { it.isNotBlank() }) }
    }

    private fun productPayload(name: String, buy: Long, sell: Long, stock: Int, min: Int) = JSONObject().put("name", name.trim()).put("buyPrice", buy).put("sellPrice", sell).put("stock", stock).put("minStock", min)
    private fun classificationJson(c: Classification) = JSONObject().put("code", c.code).put("title", c.title).apply { c.alias?.let { put("alias", it) } }
    private fun parseUser(o: JSONObject) = SakuUser(o.str("id"), o.str("name"), o.str("email"))
    private fun parseMerchant(o: JSONObject) = Merchant(o.str("id"), o.str("name"), o.str("businessCategory"), o.str("phoneNumber"), o.str("address"), o.str("businessBio"))
    private fun parseProduct(o: JSONObject) = Product(o.str("id"), o.str("name"), o.long("buyPrice"), o.long("sellPrice"), o.int("stock"), o.int("minStock").let { if(it==0) 5 else it }, o.optString("imageAssetId", "").takeIf { it.isNotBlank() })
    private fun parseDashboard(o: JSONObject) = Dashboard(o.long("revenue"), o.int("transactions"), o.long("expenses"), o.long("netProfit"), o.long("grossProfit"))
    private fun parseReport(period: String, o: JSONObject): Report {
        val trendA=o.optJSONArray("trend") ?: JSONArray(); val payA=o.optJSONArray("payments") ?: JSONArray()
        val trend=List(boundedCollectionSize(trendA.length())){i->val x=trendA.getJSONObject(i);TrendPoint(x.str("label"),x.long("amount"))}; val pays=List(boundedCollectionSize(payA.length())){i->val x=payA.getJSONObject(i);PaymentMetric(x.str("method"),x.long("amount"))}
        return Report(period,o.long("revenue"),o.long("cogs"),o.long("grossProfit"),o.long("expenses"),o.long("netProfit"),o.int("transactions"),trend,pays)
    }

    private fun parseOnboarding(o: JSONObject): OnboardingState {
        val payload=o.optJSONObject("payload") ?: JSONObject(); val b=payload.optJSONObject("business") ?: JSONObject(); val owner=payload.optJSONObject("owner") ?: JSONObject()
        fun cls(x: JSONObject?)=x?.let{Classification(it.str("code"),it.str("title"),it.optString("alias","").takeIf(String::isNotBlank))}
        val secA=payload.optJSONArray("secondaryClassifications") ?: JSONArray(); val sec=List(boundedCollectionSize(secA.length())){cls(secA.optJSONObject(it))}.filterNotNull()
        return OnboardingState(o.optString("status","IN_PROGRESS"),o.optString("step","country"),o.optString("countryCode","").takeIf(String::isNotBlank),BusinessDraft(b.str("name"),b.str("phoneNumber"),b.str("address"),b.str("bio")),OwnerDraft(owner.str("name")),cls(payload.optJSONObject("primaryClassification")),sec)
    }

    private suspend fun requestObject(path: String, method: String, body: JSONObject?, auth: Boolean, retry: Boolean) = withContext(Dispatchers.IO) { requestObjectBlocking(coreBase,path,method,body,auth,retry) }
    private fun requestObjectBlocking(base: String, path: String, method: String, body: JSONObject?, auth: Boolean, retry: Boolean): JSONObject { val raw = requestBlocking(base,path,method,body,auth,retry); return raw as? JSONObject ?: throw ApiException("INVALID_RESPONSE", 502) }
    private fun requestArrayBlocking(base: String, path: String, method: String, body: JSONObject?, auth: Boolean, retry: Boolean): JSONArray { val raw = requestBlocking(base,path,method,body,auth,retry); return raw as? JSONArray ?: throw ApiException("INVALID_RESPONSE", 502) }

    private fun requestBlocking(base: String, path: String, method: String, body: JSONObject?, auth: Boolean, retry: Boolean): Any {
        if (!base.startsWith("https://")) throw ApiException("API_BELUM_DIKONFIGURASI")
        val payload = body?.toString()?.toRequestBody(jsonMedia)
        val builder = Request.Builder()
            .url(base + path)
            .header("Accept", "application/json")
        if (auth) accessToken?.let { builder.header("Authorization", "Bearer $it") }
        when (method) {
            "GET" -> builder.get()
            "DELETE" -> if (payload == null) builder.delete() else builder.delete(payload)
            else -> builder.method(method, payload ?: ByteArray(0).toRequestBody(jsonMedia))
        }
        http.newCall(builder.build()).execute().use { response ->
            val status = response.code
            val responseBody = response.body ?: throw ApiException("INVALID_RESPONSE", 502)
            val text = String(responseBody.byteStream().use { readBoundedBytes(it, MAX_HTTP_RESPONSE_BYTES) }, StandardCharsets.UTF_8)
            val envelope = runCatching { JSONObject(text) }.getOrElse { JSONObject() }
            if (status == 401 && auth && retry) {
                val refreshToken = sessions.load()
                if (refreshToken != null) {
                    val refreshed = runCatching { refresh(refreshToken) }.isSuccess
                    if (refreshed && isSafeAutomaticRetry(method)) return requestBlocking(base, path, method, body, auth, false)
                    if (refreshed) throw ApiException("AUTH_REFRESHED_RETRY_REQUIRED", 409)
                }
            }
            if (status !in 200..299 || envelope.optBoolean("ok", true).not()) {
                throw ApiException(envelope.optString("error", "HTTP_$status"), status)
            }
            return if (envelope.has("data")) envelope.get("data") else envelope
        }
    }
}

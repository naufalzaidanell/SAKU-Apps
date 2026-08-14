package com.saku.umkm

import org.json.JSONArray
import org.json.JSONObject

internal fun JSONObject.optObject(name: String): JSONObject? = opt(name) as? JSONObject
internal fun JSONObject.optArray(name: String): JSONArray? = opt(name) as? JSONArray
internal fun JSONObject.str(name: String): String = optString(name, "")
internal fun JSONObject.long(name: String): Long = when (val v = opt(name)) {
    is Number -> v.toLong()
    is String -> v.toBigDecimalOrNull()?.toLong() ?: 0L
    else -> 0L
}
internal fun JSONObject.int(name: String): Int = when (val v = opt(name)) {
    is Number -> v.toInt()
    is String -> v.toBigDecimalOrNull()?.toInt() ?: 0
    else -> 0
}

data class SakuUser(val id: String, val name: String, val email: String)
data class Merchant(val id: String,val name: String,val businessCategory: String,val phoneNumber: String,val address: String,val businessBio: String)
data class Product(val id: String,val name: String,val buyPrice: Long,val sellPrice: Long,val stock: Int,val minStock: Int,val imageAssetId: String?)
data class Dashboard(val revenue: Long = 0,val transactions: Int = 0,val expenses: Long = 0,val netProfit: Long = 0,val grossProfit: Long = 0)
data class TrendPoint(val label: String, val amount: Long)
data class PaymentMetric(val method: String, val amount: Long)
data class Report(val period: String,val revenue: Long = 0,val cogs: Long = 0,val grossProfit: Long = 0,val expenses: Long = 0,val netProfit: Long = 0,val transactions: Int = 0,val trend: List<TrendPoint> = emptyList(),val payments: List<PaymentMetric> = emptyList())
data class TopProduct(val productId: String,val name: String,val quantitySold: Int,val grossSales: Long,val imageAssetId: String?)
data class Expense(val id: String, val description: String, val category: String, val amount: Long)
data class Session(val accessToken: String, val refreshToken: String, val user: SakuUser)
data class CheckoutResult(val invoiceNumber: String)
data class KbliEntry(val code: String, val title: String, val description: String)
data class Classification(val code: String, val title: String, val alias: String? = null)
data class BusinessDraft(val name: String = "", val phoneNumber: String = "", val address: String = "", val bio: String = "")
data class OwnerDraft(val name: String = "")
data class OnboardingState(val status: String,val step: String,val countryCode: String?,val business: BusinessDraft,val owner: OwnerDraft,val primary: Classification?,val secondary: List<Classification>)
data class AppSnapshot(val user: SakuUser,val merchant: Merchant,val dashboard: Dashboard,val products: List<Product>,val report: Report?,val topProducts: List<TopProduct>)

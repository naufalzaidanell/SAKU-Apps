package com.saku.umkm

internal object EndpointPolicy {
    private val origins = mapOf(
        "uat" to "https://saku-backend-live-production.up.railway.app",
        "production" to "https://saku-backend-production.up.railway.app",
    )

    fun expected(environment: String): String? = origins[environment.trim().lowercase()]
    fun approved(environment: String, origin: String): Boolean =
        expected(environment) == origin.trimEnd('/')
}

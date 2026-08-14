package com.saku.umkm

import java.io.ByteArrayOutputStream
import java.io.InputStream

internal const val MAX_SOURCE_IMAGE_BYTES = 12 * 1024 * 1024
internal const val MAX_HTTP_RESPONSE_BYTES = 1024 * 1024
internal const val MAX_IMAGE_PIXELS = 80_000_000L
internal const val MAX_COLLECTION_ITEMS = 1_000

internal fun readBoundedBytes(input: InputStream, maxBytes: Int): ByteArray {
    require(maxBytes > 0)
    val output = ByteArrayOutputStream(minOf(maxBytes, 64 * 1024))
    val buffer = ByteArray(16 * 1024)
    var total = 0
    while (true) {
        val count = input.read(buffer)
        if (count < 0) break
        total += count
        if (total > maxBytes) throw IllegalArgumentException("INPUT_TOO_LARGE")
        output.write(buffer, 0, count)
    }
    return output.toByteArray()
}

internal fun calculateInSampleSize(width: Int, height: Int, maxDimension: Int): Int {
    require(width > 0 && height > 0 && maxDimension > 0)
    var sample = 1
    while (width / sample > maxDimension * 2 || height / sample > maxDimension * 2) sample *= 2
    return sample
}

internal fun boundedCollectionSize(size: Int): Int {
    if (size !in 0..MAX_COLLECTION_ITEMS) throw ApiException("RESPONSE_TOO_LARGE", 502)
    return size
}

internal fun isSafeAutomaticRetry(method: String): Boolean = method.uppercase() in setOf("GET", "HEAD")

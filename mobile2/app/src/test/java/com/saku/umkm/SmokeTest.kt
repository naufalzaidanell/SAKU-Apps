package com.saku.umkm
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.assertThrows
import org.junit.Test
import java.io.ByteArrayInputStream

class SmokeTest {
    @Test fun moneyIsIntegerSafe() { assertEquals(120000L, 100000L + 20000L) }

    @Test fun environmentOriginIsExact() {
        assertTrue(EndpointPolicy.approved("uat", "https://saku-backend-live-production.up.railway.app"))
        assertFalse(EndpointPolicy.approved("uat", "https://attacker.example"))
        assertFalse(EndpointPolicy.approved("production", "https://saku-backend-live-production.up.railway.app"))
    }

    @Test fun onlySafeMethodsAreAutomaticallyRetried() {
        assertTrue(isSafeAutomaticRetry("GET"))
        assertFalse(isSafeAutomaticRetry("POST"))
        assertFalse(isSafeAutomaticRetry("PATCH"))
        assertFalse(isSafeAutomaticRetry("DELETE"))
    }

    @Test fun boundedReadRejectsOversizedInputBeforeMaterialization() {
        assertEquals(4, readBoundedBytes(ByteArrayInputStream(byteArrayOf(1,2,3,4)),4).size)
        assertThrows(IllegalArgumentException::class.java) {
            readBoundedBytes(ByteArrayInputStream(ByteArray(5)),4)
        }
    }

    @Test fun imageSamplingIsPowerOfTwoAndBounded() {
        assertEquals(1,calculateInSampleSize(1200,800,1280))
        assertEquals(4,calculateInSampleSize(8000,6000,1280))
    }

    @Test fun collectionSizeIsCapped() {
        assertEquals(1000,boundedCollectionSize(1000))
        assertThrows(ApiException::class.java){boundedCollectionSize(1001)}
    }
}

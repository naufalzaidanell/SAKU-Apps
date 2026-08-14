package com.saku.umkm

import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.graphics.Paint
import android.graphics.Typeface
import android.graphics.pdf.PdfDocument
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import androidx.core.content.FileProvider
import java.io.File
import java.io.FileOutputStream
import java.text.NumberFormat
import java.util.Date
import java.text.SimpleDateFormat
import java.util.Locale

object ReportExporter {
    private val id = Locale("id", "ID")
    private val money = NumberFormat.getNumberInstance(id)
    private fun rupiah(v: Long) = "Rp ${money.format(v)}"

    fun exportAndShare(context: Context, merchantName: String, report: Report) {
        val fileName = "SAKU-Laporan-${report.period}-${System.currentTimeMillis()}.pdf"
        val uri = createPdf(context, fileName, merchantName, report)
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "application/pdf"
            putExtra(Intent.EXTRA_STREAM, uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        context.startActivity(Intent.createChooser(intent, "Bagikan laporan SAKU"))
    }

    private fun createPdf(context: Context, fileName: String, merchantName: String, report: Report): Uri {
        val document = PdfDocument()
        try {
            val page = document.startPage(PdfDocument.PageInfo.Builder(595, 842, 1).create())
            val c = page.canvas
            val title = Paint(Paint.ANTI_ALIAS_FLAG).apply { textSize = 22f; typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD); color = 0xFF14231C.toInt() }
            val h2 = Paint(Paint.ANTI_ALIAS_FLAG).apply { textSize = 12f; typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD); color = 0xFF08734A.toInt() }
            val body = Paint(Paint.ANTI_ALIAS_FLAG).apply { textSize = 10f; color = 0xFF44554D.toInt() }
            val value = Paint(Paint.ANTI_ALIAS_FLAG).apply { textSize = 14f; typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD); color = 0xFF14231C.toInt() }
            val line = Paint(Paint.ANTI_ALIAS_FLAG).apply { strokeWidth = 1f; color = 0xFFE1E8E4.toInt() }
            c.drawText("SAKU", 42f, 52f, h2)
            c.drawText("Laporan Usaha", 42f, 84f, title)
            c.drawText(merchantName.ifBlank { "Merchant SAKU" }, 42f, 105f, body)
            c.drawText("Periode: ${report.period} • ${SimpleDateFormat("dd MMM yyyy HH:mm", id).format(Date())}", 42f, 122f, body)
            c.drawLine(42f, 140f, 553f, 140f, line)
            val metrics = listOf("Pendapatan" to rupiah(report.revenue),"HPP" to rupiah(report.cogs),"Pengeluaran" to rupiah(report.expenses),"Laba Bersih" to rupiah(report.netProfit),"Transaksi" to report.transactions.toString())
            var y = 172f
            metrics.forEach { (label, v) -> c.drawText(label, 42f, y, body); c.drawText(v, 250f, y, value); y += 31f }
            y += 18f; c.drawText("Metode pembayaran", 42f, y, h2); y += 24f
            if (report.payments.isEmpty()) { c.drawText("Belum ada transaksi pada periode ini.", 42f, y, body); y += 22f }
            else report.payments.take(10).forEach { p -> c.drawText(p.method, 42f, y, body); c.drawText(rupiah(p.amount), 250f, y, body); y += 21f }
            y += 14f; c.drawText("Ringkasan tren", 42f, y, h2); y += 24f
            if (report.trend.isEmpty()) c.drawText("Belum ada tren penjualan pada periode ini.", 42f, y, body)
            else report.trend.take(14).forEach { p -> c.drawText(p.label.take(28), 42f, y, body); c.drawText(rupiah(p.amount), 250f, y, body); y += 19f }
            c.drawText("Dibuat oleh SAKU • Transaksi Mudah, Kreatif, Unggul.", 42f, 806f, body)
            document.finishPage(page)
            return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val values = ContentValues().apply { put(MediaStore.Downloads.DISPLAY_NAME, fileName); put(MediaStore.Downloads.MIME_TYPE, "application/pdf"); put(MediaStore.Downloads.RELATIVE_PATH, "Download/SAKU"); put(MediaStore.Downloads.IS_PENDING, 1) }
                val resolver = context.contentResolver
                val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values) ?: error("PDF_DESTINATION_UNAVAILABLE")
                resolver.openOutputStream(uri)?.use { document.writeTo(it) } ?: error("PDF_WRITE_FAILED")
                values.clear(); values.put(MediaStore.Downloads.IS_PENDING, 0); resolver.update(uri, values, null, null); uri
            } else {
                val dir = File(context.getExternalFilesDir(null), "reports").apply { mkdirs() }
                val file = File(dir, fileName); FileOutputStream(file).use { document.writeTo(it) }
                FileProvider.getUriForFile(context, "${context.packageName}.files", file)
            }
        } finally { document.close() }
    }
}

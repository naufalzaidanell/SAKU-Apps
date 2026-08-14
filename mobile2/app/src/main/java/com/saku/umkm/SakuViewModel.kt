package com.saku.umkm

import android.app.Application
import android.content.ContentResolver
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.provider.OpenableColumns
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.Dispatchers
import java.io.ByteArrayOutputStream

sealed interface RootState {
    data object Booting : RootState
    data class Auth(val register: Boolean = false, val message: String? = null) : RootState
    data class Onboarding(val state: OnboardingState, val loading: Boolean = false, val message: String? = null) : RootState
    data class Ready(val snapshot: AppSnapshot) : RootState
    data class Fatal(val message: String) : RootState
}

data class UiFlags(val loading:Boolean=false,val message:String?=null,val page:AppPage=AppPage.DASHBOARD,val reportPeriod:String="daily",val report:Report?=null,val expenses:List<Expense> = emptyList(),val cart:Map<String,Int> = emptyMap(),val paymentMethod:String="CASH",val productQuery:String="",val darkMode:Boolean=false)
enum class AppPage { DASHBOARD, CASHIER, PRODUCTS, REPORT }
data class ProductDraft(val id:String?=null,val name:String="",val buyPrice:String="0",val sellPrice:String="0",val stock:String="0",val minStock:String="5",val imageBytes:ByteArray?=null,val imageMime:String?=null)

class SakuViewModel(app: Application) : AndroidViewModel(app) {
    private val sessionStore=SecureSessionStore(app); private val api=SakuApi(sessionStore); private val prefs=app.getSharedPreferences("saku_mobile_2_prefs",0)
    private val _root=MutableStateFlow<RootState>(RootState.Booting); val root:StateFlow<RootState> = _root.asStateFlow()
    private val _flags=MutableStateFlow(UiFlags(darkMode=prefs.getBoolean("darkMode",false))); val flags:StateFlow<UiFlags> = _flags.asStateFlow()
    private val _kbli=MutableStateFlow<List<KbliEntry>>(emptyList()); val kbli:StateFlow<List<KbliEntry>> = _kbli.asStateFlow()
    private val _kbliLoading=MutableStateFlow(false); val kbliLoading:StateFlow<Boolean> = _kbliLoading.asStateFlow()

    init { boot() }

    fun boot(){viewModelScope.launch{_root.value=RootState.Booting;if(!api.configured()){_root.value=RootState.Fatal("Backend production belum dikonfigurasi pada build ini.");return@launch};val restored=runCatching{api.restore()}.getOrDefault(false);if(!restored){_root.value=RootState.Auth();return@launch};routeAfterSession()}}
    fun switchAuth(register:Boolean){_root.value=RootState.Auth(register)}
    fun login(email:String,password:String)=submitAuth(false,"","",email,password)
    fun register(name:String,business:String,email:String,password:String)=submitAuth(true,name,business,email,password)

    private fun submitAuth(register:Boolean,name:String,business:String,email:String,password:String){viewModelScope.launch{_flags.value=_flags.value.copy(loading=true,message=null);runCatching{if(register)api.register(name,business,email,password) else api.login(email,password)}.onSuccess{routeAfterSession()}.onFailure{_root.value=RootState.Auth(register,userMessage(it))};_flags.value=_flags.value.copy(loading=false)}}

    private suspend fun routeAfterSession(){
        val onboarding=runCatching{api.onboardingState()}
        if(onboarding.isFailure){val e=onboarding.exceptionOrNull();if(e is ApiException&&e.status==404)loadReady() else _root.value=RootState.Fatal(userMessage(e));return}
        val state=onboarding.getOrThrow()
        when{state.status=="COMPLETED"->loadReady();state.step=="provisioning"->{_root.value=RootState.Onboarding(state,loading=true);runCatching{api.completeOnboarding(state)}.onSuccess{loadReady()}.onFailure{_root.value=RootState.Onboarding(state,message=userMessage(it))}};else->_root.value=RootState.Onboarding(state)}
    }

    fun advanceSimpleOnboarding(nextStep:String,countryCode:String?=null,data:org.json.JSONObject=org.json.JSONObject()){viewModelScope.launch{val current=(_root.value as? RootState.Onboarding)?.state?:return@launch;_root.value=RootState.Onboarding(current,loading=true);runCatching{api.saveOnboarding(nextStep,data,countryCode)}.onSuccess{_root.value=RootState.Onboarding(it)}.onFailure{_root.value=RootState.Onboarding(current,message=userMessage(it))}}}
    fun saveBusiness(name:String,phone:String,address:String,bio:String){val data=org.json.JSONObject().put("business",org.json.JSONObject().put("name",name.trim()).put("phoneNumber",phone.trim().ifBlank{org.json.JSONObject.NULL}).put("address",address.trim().ifBlank{org.json.JSONObject.NULL}).put("bio",bio.trim().ifBlank{org.json.JSONObject.NULL}));advanceSimpleOnboarding("classification","ID",data)}
    fun searchKbli(query:String){viewModelScope.launch{_kbliLoading.value=true;_kbli.value=runCatching{api.searchKbli(query)}.getOrElse{emptyList()};_kbliLoading.value=false}}

    fun selectClassification(entry:KbliEntry,primary:Boolean){val current=(_root.value as? RootState.Onboarding)?.state?:return;val chosen=Classification(entry.code,entry.title);val next=if(primary){val sec=current.secondary.filterNot{it.code==chosen.code}.toMutableList();current.primary?.takeIf{it.code!=chosen.code&&sec.none{s->s.code==it.code}}?.let{sec.add(0,it)};current.copy(primary=chosen,secondary=sec.take(8))}else{if(current.primary?.code==chosen.code)current else{val sec=current.secondary.toMutableList();val idx=sec.indexOfFirst{it.code==chosen.code};if(idx>=0)sec.removeAt(idx) else if(sec.size<8)sec.add(chosen);current.copy(secondary=sec)}};_root.value=RootState.Onboarding(next)}

    fun persistClassification(){val current=(_root.value as? RootState.Onboarding)?.state?:return;val primary=current.primary?:run{_root.value=RootState.Onboarding(current,message="Pilih satu klasifikasi usaha utama.");return};val data=org.json.JSONObject().put("primaryClassification",org.json.JSONObject().put("code",primary.code).put("title",primary.title)).put("secondaryClassifications",org.json.JSONArray().apply{current.secondary.take(8).forEach{put(org.json.JSONObject().put("code",it.code).put("title",it.title))}});advanceSimpleOnboarding("owner","ID",data)}
    fun saveOwner(name:String){val data=org.json.JSONObject().put("owner",org.json.JSONObject().put("name",name.trim()));advanceSimpleOnboarding("consent","ID",data)}
    fun completeOnboarding(){viewModelScope.launch{val current=(_root.value as? RootState.Onboarding)?.state?:return@launch;_root.value=RootState.Onboarding(current,loading=true);runCatching{val provisioning=api.saveOnboarding("provisioning",org.json.JSONObject(),"ID");api.completeOnboarding(provisioning)}.onSuccess{loadReady()}.onFailure{_root.value=RootState.Onboarding(current,message=userMessage(it))}}}

    private suspend fun loadReady(){_root.value=RootState.Booting;runCatching{api.snapshot()}.onSuccess{snap->_root.value=RootState.Ready(snap);_flags.value=_flags.value.copy(report=snap.report,loading=false,message=null);loadExpenses()}.onFailure{_root.value=RootState.Fatal(userMessage(it))}}
    fun refreshAll()=viewModelScope.launch{_flags.value=_flags.value.copy(loading=true,message=null);val snap=runCatching{api.snapshot()};if(snap.isSuccess)_root.value=RootState.Ready(snap.getOrThrow()) else _flags.value=_flags.value.copy(message=userMessage(snap.exceptionOrNull()));_flags.value=_flags.value.copy(loading=false)}
    fun setPage(page:AppPage){_flags.value=_flags.value.copy(page=page,message=null);if(page==AppPage.REPORT)loadReport(_flags.value.reportPeriod)}
    fun setProductQuery(q:String){_flags.value=_flags.value.copy(productQuery=q)}
    fun setDarkMode(value:Boolean){prefs.edit().putBoolean("darkMode",value).apply();_flags.value=_flags.value.copy(darkMode=value)}

    fun addCart(product:Product){if(product.stock<=0)return;val cart=_flags.value.cart.toMutableMap();val q=cart[product.id]?:0;if(q<product.stock)cart[product.id]=q+1;_flags.value=_flags.value.copy(cart=cart)}
    fun decCart(productId:String){val cart=_flags.value.cart.toMutableMap();val q=cart[productId]?:0;if(q<=1)cart.remove(productId) else cart[productId]=q-1;_flags.value=_flags.value.copy(cart=cart)}
    fun setPaymentMethod(method:String){_flags.value=_flags.value.copy(paymentMethod=method)}

    fun checkout(){viewModelScope.launch{val cart=_flags.value.cart;if(cart.isEmpty())return@launch;_flags.value=_flags.value.copy(loading=true,message=null);runCatching{api.checkout(cart,_flags.value.paymentMethod)}.onSuccess{result->_flags.value=_flags.value.copy(cart=emptyMap(),message="Transaksi ${result.invoiceNumber.ifBlank{"berhasil"}} berhasil.");loadReady()}.onFailure{_flags.value=_flags.value.copy(message=userMessage(it))};_flags.value=_flags.value.copy(loading=false)}}

    fun saveProduct(d:ProductDraft){viewModelScope.launch{val name=d.name.trim();val buy=d.buyPrice.toLongOrNull();val sell=d.sellPrice.toLongOrNull();val stock=d.stock.toIntOrNull();val min=d.minStock.toIntOrNull();if(name.length<2||buy==null||sell==null||stock==null||min==null||min<0||stock<0||buy<0||sell<0){_flags.value=_flags.value.copy(message="Data produk belum valid.");return@launch};if(d.id==null&&d.imageBytes==null){_flags.value=_flags.value.copy(message="Foto produk wajib dipilih.");return@launch};_flags.value=_flags.value.copy(loading=true,message=null);runCatching{if(d.id==null)api.createProduct(name,buy,sell,stock,min,d.imageBytes!!,d.imageMime?:"image/jpeg") else api.updateProduct(d.id,name,buy,sell,stock,min,d.imageBytes,d.imageMime)}.onSuccess{refreshAll()}.onFailure{_flags.value=_flags.value.copy(message=userMessage(it))};_flags.value=_flags.value.copy(loading=false)}}
    fun deleteProduct(id:String)=viewModelScope.launch{_flags.value=_flags.value.copy(loading=true,message=null);runCatching{api.deleteProduct(id)}.onSuccess{refreshAll()}.onFailure{_flags.value=_flags.value.copy(message=userMessage(it))};_flags.value=_flags.value.copy(loading=false)}
    fun loadReport(period:String)=viewModelScope.launch{_flags.value=_flags.value.copy(reportPeriod=period,loading=true,message=null);runCatching{api.report(period)}.onSuccess{_flags.value=_flags.value.copy(report=it)}.onFailure{_flags.value=_flags.value.copy(message=userMessage(it))};_flags.value=_flags.value.copy(loading=false)}
    fun loadExpenses()=viewModelScope.launch{val rows=runCatching{api.expenses()}.getOrDefault(emptyList());_flags.value=_flags.value.copy(expenses=rows)}
    fun addExpense(description:String,category:String,amount:Long)=viewModelScope.launch{if(amount<=0)return@launch;_flags.value=_flags.value.copy(loading=true,message=null);runCatching{api.addExpense(description,category,amount)}.onSuccess{loadExpenses();loadReport(_flags.value.reportPeriod)}.onFailure{_flags.value=_flags.value.copy(message=userMessage(it))};_flags.value=_flags.value.copy(loading=false)}
    fun updateMerchant(name:String,category:String,phone:String,address:String,bio:String)=viewModelScope.launch{_flags.value=_flags.value.copy(loading=true,message=null);runCatching{api.updateMerchant(name,category,phone,address,bio)}.onSuccess{refreshAll()}.onFailure{_flags.value=_flags.value.copy(message=userMessage(it))};_flags.value=_flags.value.copy(loading=false)}
    fun changePassword(current:String,next:String)=viewModelScope.launch{if(next.length<12){_flags.value=_flags.value.copy(message="Password baru minimal 12 karakter.");return@launch};_flags.value=_flags.value.copy(loading=true,message=null);runCatching{api.changePassword(current,next)}.onSuccess{_flags.value=_flags.value.copy(message="Password berhasil diperbarui.")}.onFailure{_flags.value=_flags.value.copy(message=userMessage(it))};_flags.value=_flags.value.copy(loading=false)}
    fun logout()=viewModelScope.launch{val revoked=runCatching{api.logout()}.getOrDefault(false);_flags.value=UiFlags(darkMode=_flags.value.darkMode);_root.value=RootState.Auth(message=if(revoked)null else "Anda sudah keluar dari perangkat ini. Pencabutan sesi server akan dicoba kembali saat aplikasi dibuka.")}
    fun clearMessage(){_flags.value=_flags.value.copy(message=null);val r=_root.value;if(r is RootState.Onboarding&&r.message!=null)_root.value=r.copy(message=null)}

    suspend fun prepareImage(resolver:ContentResolver,uri:Uri):Pair<ByteArray,String> = withContext(Dispatchers.IO){
        val declaredSize=resolver.query(uri,arrayOf(OpenableColumns.SIZE),null,null,null)?.use{cursor->if(cursor.moveToFirst())cursor.getLong(0)else-1L}?:-1L
        if(declaredSize>MAX_SOURCE_IMAGE_BYTES)throw IllegalArgumentException("IMAGE_TOO_LARGE")
        val bytes=resolver.openInputStream(uri)?.use{readBoundedBytes(it,MAX_SOURCE_IMAGE_BYTES)}?:throw IllegalArgumentException("IMAGE_READ_FAILED")
        val bounds=BitmapFactory.Options().apply{inJustDecodeBounds=true}
        BitmapFactory.decodeByteArray(bytes,0,bytes.size,bounds)
        if(bounds.outWidth<=0||bounds.outHeight<=0)return@withContext bytes to (resolver.getType(uri)?:"image/jpeg")
        if(bounds.outWidth.toLong()*bounds.outHeight.toLong()>MAX_IMAGE_PIXELS)throw IllegalArgumentException("IMAGE_DIMENSIONS_TOO_LARGE")
        val options=BitmapFactory.Options().apply{inSampleSize=calculateInSampleSize(bounds.outWidth,bounds.outHeight,1280)}
        val bitmap=BitmapFactory.decodeByteArray(bytes,0,bytes.size,options)?:throw IllegalArgumentException("IMAGE_DECODE_FAILED")
        val scale=minOf(1f,1280f/maxOf(bitmap.width,bitmap.height));val outBmp=if(scale<1f)Bitmap.createScaledBitmap(bitmap,(bitmap.width*scale).toInt().coerceAtLeast(1),(bitmap.height*scale).toInt().coerceAtLeast(1),true)else bitmap
        val out=ByteArrayOutputStream();outBmp.compress(Bitmap.CompressFormat.JPEG,82,out);if(outBmp!==bitmap)outBmp.recycle();bitmap.recycle();out.toByteArray() to "image/jpeg"
    }

    private fun userMessage(t:Throwable?):String{val code=(t as? ApiException)?.code?:t?.message?:"REQUEST_FAILED";return when(code){"INVALID_REQUEST"->"Data belum lengkap atau tidak valid.";"UNAUTHORIZED"->"Sesi tidak valid. Silakan masuk kembali.";"AUTH_REFRESHED_RETRY_REQUIRED"->"Sesi sudah diperbarui. Silakan ulangi tindakan Anda agar tidak terjadi data ganda.";"INSUFFICIENT_STOCK"->"Stok tidak mencukupi.";"RESOURCE_CONFLICT"->"Data sudah digunakan.";"IDEMPOTENCY_CONFLICT"->"Permintaan transaksi yang sama digunakan untuk keranjang berbeda.";"CURRENT_PASSWORD_INVALID"->"Password saat ini tidak sesuai.";"RATE_LIMITED"->"Terlalu banyak percobaan. Coba lagi beberapa saat.";"IMAGE_TOO_LARGE","INPUT_TOO_LARGE","IMAGE_DIMENSIONS_TOO_LARGE"->"Ukuran atau resolusi foto terlalu besar.";"RESPONSE_TOO_LARGE"->"Respons server terlalu besar dan dibatalkan demi keamanan.";"API_BELUM_DIKONFIGURASI"->"Backend production belum dikonfigurasi.";"PRIMARY_CLASSIFICATION_REQUIRED"->"Pilih klasifikasi usaha utama.";else->code.replace('_',' ').lowercase().replaceFirstChar{it.uppercase()}}}
}
